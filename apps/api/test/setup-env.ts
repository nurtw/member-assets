/**
 * Loads `.env` before any test constructs a Nest module.
 *
 * The end-to-end suite talks to a real database, so `DATABASE_URL` must be set
 * — and vitest, like `nest start`, does not read `.env` on its own. Without this
 * the suite passes only on a machine where the variable happens to be exported
 * in the shell, and fails on every other one with an error that reads like
 * missing configuration rather than a missing setup file.
 *
 * The same trap `main.ts` avoids by importing `dotenv/config` on its first line.
 * See CLAUDE.md → "The `.env` trap that cost real time".
 */
import 'dotenv/config';

/**
 * The suite never uses the real object store. `.env` holds the live `CLOUDINARY_URL`, and with it
 * the photograph tests uploaded test images to the Union's own Cloudinary account over the
 * network, and failed with a 500 whenever that call ran slow (about five seconds). With it
 * unset, `MediaModule` binds `LocalFilesystemStorage` (`var/media`, ignored by git), which is
 * what these tests are about anyway: the bytes are identified, signed, and served, not hosted.
 */
delete process.env.CLOUDINARY_URL;
