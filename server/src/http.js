export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Express 4 does not catch rejected promises on its own. */
export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Validates `data` with a zod schema and throws a 400 with a readable message. */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? 'Invalid input');
  }
  return result.data;
}
