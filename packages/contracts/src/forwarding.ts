/**
 * How the website tells the API whose browser a request came from (item 55).
 *
 * Every browser request reaches the API through the website's rewrite, so the
 * address the API sees is the website host's own. The website's proxy names
 * the visitor's address in `VISITOR_ADDRESS_HEADER`, and proves it is the
 * website with the shared secret in `FORWARDING_KEY_HEADER`. The API believes
 * the address only when the secret matches.
 *
 * Both are removed from every request the website forwards before it adds its
 * own, so a browser can supply neither.
 */
export const FORWARDING_KEY_HEADER = 'x-nurtw-forwarding-key';
export const VISITOR_ADDRESS_HEADER = 'x-nurtw-visitor-address';
