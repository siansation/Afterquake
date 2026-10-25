// Keep only the current fit. Display choices do not change the posterior, but a
// revised catalogue or replay time does. Controllers clear it after live updates.
const FORECAST_CACHE = (() => {
  function create(model, shake) {
    let current = null;
    return {
      at(events, now) {
        if (!current || current.events !== events || current.now !== now) {
          const f = model.fit(events, now);
          current = { events, now, f, cp: shake.compact(f) };
        }
        return current;
      },
      clear() { current = null; },
    };
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = FORECAST_CACHE;
