const GARBAGE_MARK_STYLES: Record<string, string> = {
  5: 'radial-gradient(circle at 34% 28%, #d6dbe0 0 15%, #9ba3ae 16% 58%, #626b78 59% 100%)',
  6: 'radial-gradient(circle, transparent 0 50%, #4f5864 51% 59%, transparent 60%), radial-gradient(circle at 34% 28%, #d6dbe0 0 15%, #9ba3ae 16% 58%, #626b78 59% 100%)',
  7: 'linear-gradient(#4f5864,#4f5864) center/58% 2px no-repeat, linear-gradient(90deg,#4f5864,#4f5864) center/2px 58% no-repeat, radial-gradient(circle at 34% 28%, #d6dbe0 0 15%, #9ba3ae 16% 58%, #626b78 59% 100%)',
  8: 'linear-gradient(30deg, transparent 42%, #4f5864 43% 50%, transparent 51%), linear-gradient(150deg, transparent 42%, #4f5864 43% 50%, transparent 51%), linear-gradient(90deg, transparent 42%, #4f5864 43% 50%, transparent 51%), radial-gradient(circle at 34% 28%, #d6dbe0 0 15%, #9ba3ae 16% 58%, #626b78 59% 100%)',
  9: 'radial-gradient(circle at 32% 32%, #4f5864 0 8%, transparent 9%), radial-gradient(circle at 68% 32%, #4f5864 0 8%, transparent 9%), radial-gradient(circle at 32% 68%, #4f5864 0 8%, transparent 9%), radial-gradient(circle at 68% 68%, #4f5864 0 8%, transparent 9%), linear-gradient(#4f5864,#4f5864) center/48% 2px no-repeat, linear-gradient(90deg,#4f5864,#4f5864) center/2px 48% no-repeat, radial-gradient(circle at 34% 28%, #d6dbe0 0 15%, #9ba3ae 16% 58%, #626b78 59% 100%)',
}

const COLOR_SIGNATURE = ['#ff5b68', '#5aa7ff', '#58d68d', '#b66cff']

function isPuyoColorMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object') return false
  const map = value as Record<string, unknown>
  return COLOR_SIGNATURE.every((color, index) => map[String(index + 1)] === color)
}

for (const key of Object.keys(GARBAGE_MARK_STYLES)) {
  if (Object.prototype.hasOwnProperty.call(Object.prototype, key)) continue
  Object.defineProperty(Object.prototype, key, {
    configurable: true,
    enumerable: false,
    get(this: Record<string, unknown>) {
      return isPuyoColorMap(this) ? GARBAGE_MARK_STYLES[key] : undefined
    },
  })
}
