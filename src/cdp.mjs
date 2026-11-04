export async function connectCDP(url) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw Error('CDP must be loopback');
  const ws = new WebSocket(url),
    pending = new Map(),
    listeners = new Map();
  let next = 0;
  await new Promise((ok, no) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', no, { once: true });
  });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.no(Error(JSON.stringify(m.error))) : p.ok(m.result);
      }
    } else for (const fn of listeners.get(m.method) || []) fn(m.params);
  });
  ws.addEventListener('close', () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.no(Error('CDP closed'));
    }
    pending.clear();
  });
  return {
    call(method, params = {}) {
      return new Promise((ok, no) => {
        const id = ++next,
          timer = setTimeout(() => {
            pending.delete(id);
            no(Error(`CDP timeout: ${method}`));
          }, 20000);
        pending.set(id, { ok, no, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, fn) {
      listeners.set(method, [...(listeners.get(method) || []), fn]);
    },
    close() {
      ws.close();
    },
  };
}
export async function evaluate(cdp, expression) {
  const r = await cdp.call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
export async function click(cdp, selector) {
  const point = await evaluate(
    cdp,
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing click target');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`
  );
  await cdp.call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...point,
  });
  await cdp.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...point,
  });
}
