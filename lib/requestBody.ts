// lib/requestBody.ts

/**
 * Reads a JSON request body without letting a malformed one become a 500.
 *
 * `req.json()` throws a SyntaxError when the body is not JSON, and destructuring
 * a non-object body (`null`, a bare string, a number) throws a TypeError. Both
 * land in a route's catch block, which is there for *genuine server faults* —
 * so a client posting `not json` was logged as an error and answered with
 * 500 "Internal server error". That is a lie: nothing on the server is broken,
 * the request was bad. Status codes are used honestly here, so this is a 400.
 *
 * Returns the parsed object, or null when the body is unusable. The caller
 * decides what the 400 message says, because the user-facing string belongs
 * with the route that knows what was being asked for.
 */
export async function readJsonBody(req: Request): Promise<Record<string, any> | null> {
    try {
        const body = await req.json();

        // Arrays pass this check too, and that is fine — destructuring named
        // fields off one yields undefined, which each route already validates.
        if (body === null || typeof body !== "object") return null;

        return body as Record<string, any>;
    } catch {
        return null;
    }
}
