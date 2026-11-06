/**
 * A very small React work-alike, enough to execute the plugin page in Node.
 *
 * The page is a plain browser script with no JSX and no build step, and this
 * environment has no browser to drive. This runtime supplies `createElement`,
 * function components, class components and hooks so the real `client.js` can
 * be rendered, its effects awaited, and its output inspected as text.
 *
 * It enforces the one React rule a hand-written renderer would otherwise hide:
 * a component must call the same number of hooks on every render. React reports
 * a violation as "Rendered more hooks than during the previous render" (error
 * #310) and blanks the slot; here it throws so a test fails instead.
 */

class Component {
  constructor(props) {
    this.props = props
    this.state = {}
  }
  setState(patch) {
    const next = typeof patch === 'function' ? patch(this.state, this.props) : patch
    this.state = { ...this.state, ...next }
    this.context.dirty = true
  }
}

export function createRenderer() {
  const store = new Map()
  const hookCounts = new Map()
  const frames = []
  // React identifies a component instance by (position, type): a different
  // component type at the same position is a fresh instance, not a hook-order
  // change. Mirror that so a conditional sibling cannot look like a violation.
  const typeIds = new WeakMap()
  let nextTypeId = 0
  let counter = 0
  let currentContext = null

  function typeIdOf(type) {
    if (!typeIds.has(type)) typeIds.set(type, ++nextTypeId)
    return typeIds.get(type)
  }

  function hookId(kind) {
    const frame = frames[frames.length - 1]
    if (!frame) throw new Error(`hook ${kind} called outside a component`)
    const index = counter - frame.start
    counter++
    return `${frame.key}#${kind}${index}`
  }

  const React = {
    Component,
    createElement(type, props, ...children) {
      // Keep null/undefined/false children in place: React keeps their slot in
      // the child list, so a conditional sibling does not shift the position of
      // the components after it. Filtering here would hide exactly the kind of
      // remount React does not perform.
      const raw = children.flat(Infinity)
      const withChildren = raw.length === 0
        ? (props || {})
        : { ...(props || {}), children: raw.length === 1 ? raw[0] : raw }
      return { type, props: withChildren, children: raw }
    },
    useState(initial) {
      const id = hookId('state')
      const frame = store.get(id) || { value: typeof initial === 'function' ? initial() : initial }
      store.set(id, frame)
      const context = currentContext
      return [frame.value, (next) => {
        frame.value = typeof next === 'function' ? next(frame.value) : next
        context.dirty = true
      }]
    },
    useMemo(factory, deps) {
      const id = hookId('memo')
      const frame = store.get(id)
      if (frame && deps && frame.deps && deps.length === frame.deps.length && deps.every((dep, index) => Object.is(dep, frame.deps[index]))) {
        return frame.value
      }
      const value = factory()
      store.set(id, { value, deps })
      return value
    },
    useCallback(fn, deps) {
      const id = hookId('cb')
      const frame = store.get(id)
      if (frame && deps && frame.deps && deps.length === frame.deps.length && deps.every((dep, index) => Object.is(dep, frame.deps[index]))) {
        return frame.fn
      }
      store.set(id, { fn, deps })
      return fn
    },
    useRef(initial) {
      const id = hookId('ref')
      if (!store.has(id)) store.set(id, { current: initial })
      return store.get(id)
    },
    useEffect(effect, deps) {
      const id = hookId('effect')
      const frame = store.get(id) || { ran: false, deps: undefined, cleanup: undefined }
      store.set(id, frame)
      currentContext.effects.push({ frame, effect, deps })
    },
    // The harness has no paint phase, so a layout effect behaves like a normal
    // one. It exists so components can use the real React hook.
    useLayoutEffect(effect, deps) {
      const id = hookId('layout-effect')
      const frame = store.get(id) || { ran: false, deps: undefined, cleanup: undefined }
      store.set(id, frame)
      currentContext.effects.push({ frame, effect, deps })
    },
  }

  function renderNode(node, path) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (typeof node === 'string' || typeof node === 'number') return { text: String(node) }
    if (Array.isArray(node)) {
      return { children: node.map((child, index) => renderNode(child, `${path}/${index}`)).filter(Boolean) }
    }
    const { type, props, children } = node
    if (typeof type === 'string') {
      return {
        tag: type,
        props,
        children: children.map((child, index) => renderNode(child, `${path}/${index}`)).filter(Boolean),
      }
    }
    if (typeof type === 'function') {
      if (type.prototype && typeof type.prototype.render === 'function') {
        const instance = new type(props)
        instance.props = props
        instance.context = currentContext
        return renderNode(instance.render(), `${path}>`)
      }
      const start = counter
      const key = `${path}|${typeIdOf(type)}`
      frames.push({ key, start })
      let output
      try {
        output = type({ ...props, children })
      } finally {
        frames.pop()
      }
      const used = counter - start
      const previous = hookCounts.get(key)
      if (previous !== undefined && previous !== used) {
        const direction = used > previous ? 'more' : 'fewer'
        throw new Error(
          `Rendered ${direction} hooks than during the previous render in <${type.name || 'anonymous'}> `
          + `(${previous} -> ${used}). React reports this as error #310 and blanks the slot.`,
        )
      }
      hookCounts.set(key, used)
      return renderNode(output, `${path}>`)
    }
    throw new Error(`unsupported element type: ${String(type)}`)
  }

  return {
    React,
    /** Render `element`, run the effects it scheduled, and render again. */
    async render(element, { passes = 8 } = {}) {
      let tree = null
      for (let pass = 0; pass < passes; pass++) {
        counter = 0
        currentContext = { dirty: false, effects: [] }
        const context = currentContext
        tree = renderNode(element, 'root')
        let awaited = false
        for (const entry of context.effects) {
          const { frame, effect, deps } = entry
          const same = frame.ran && deps && frame.deps && deps.length === frame.deps.length
            && deps.every((dep, index) => Object.is(dep, frame.deps[index]))
          if (same) continue
          if (typeof frame.cleanup === 'function') frame.cleanup()
          const cleanup = effect()
          frame.ran = true
          frame.deps = deps
          frame.cleanup = typeof cleanup === 'function' ? cleanup : undefined
          if (cleanup && typeof cleanup.then === 'function') { await cleanup; awaited = true }
        }
        // Let a pending fetch chain settle before deciding whether to stop.
        await new Promise((resolve) => setTimeout(resolve, 0))
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (!context.dirty && !awaited) return tree
        if (!context.dirty) return tree
      }
      return tree
    },
  }
}

/** Collect the visible text of a rendered tree. */
export function textOf(tree) {
  if (!tree) return ''
  if (tree.text !== undefined) return tree.text
  const children = tree.children || []
  return children.map(textOf).join(' ')
}

/** Depth-first search over rendered nodes. */
export function findAll(tree, predicate, out = []) {
  if (!tree) return out
  if (predicate(tree)) out.push(tree)
  for (const child of tree.children || []) findAll(child, predicate, out)
  return out
}

export function findByText(tree, text) {
  const matches = findAll(tree, (node) => node.text === text)
  return matches.length ? matches[0] : null
}
