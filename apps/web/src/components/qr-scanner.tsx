"use client";

import { looksLikeStickerCode, stickerCodeFromScan } from "@nurtw/domain";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

/**
 * Reading a sticker's QR code with the device's camera (PRD Requirement 9A.7,
 * revision 1.12; item 27).
 *
 * The picture never leaves the device. Frames are read here, in the browser:
 * by the browser's own detector where it has one, and by jsQR where it has
 * not (Safari, Firefox, and Chrome on a desktop). jsQR is loaded only then.
 *
 * A camera needs a secure page and the officer's permission, and a phone may
 * have neither to give, so every use of the scanner also offers the number
 * typed in.
 */

/** The part of the browser's own detector this uses. Not yet in the DOM types. */
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type NativeDetectorConstructor = new (options: {
  formats: string[];
}) => NativeDetector;

type CameraState = "STARTING" | "SCANNING" | "DENIED" | "UNAVAILABLE";

/** How often a frame is read. Faster gains nothing and warms the phone. */
const READ_EVERY_MS = 140;
/** jsQR reads a frame no wider than this; a sticker's code needs no more. */
const FRAME_WIDTH = 640;

async function frameReader(): Promise<
  (video: HTMLVideoElement) => Promise<string | null>
> {
  const Native = (window as { BarcodeDetector?: NativeDetectorConstructor })
    .BarcodeDetector;
  if (Native) {
    try {
      const detector = new Native({ formats: ["qr_code"] });
      return async (video) =>
        (await detector.detect(video))[0]?.rawValue ?? null;
    } catch {
      // The detector exists but reads no QR codes here: fall through.
    }
  }

  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!context || video.videoWidth === 0) {
      return null;
    }
    const scale = Math.min(1, FRAME_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    return (
      jsQR(frame.data, frame.width, frame.height, {
        inversionAttempts: "dontInvert",
      })?.data ?? null
    );
  };
}

/**
 * The camera's view, reading until it finds a code. `onRead` is given what
 * the code holds, once for each time the camera settles on a new one.
 */
export function QrScanner({ onRead }: { onRead: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>("STARTING");
  // Kept in a ref so the reading loop always calls the latest handler.
  const handler = useRef(onRead);
  useEffect(() => {
    handler.current = onRead;
  }, [onRead]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = "";

    const media = navigator.mediaDevices;
    const request = media?.getUserMedia
      ? media.getUserMedia({
          audio: false,
          video: {
            // The camera on the back of a phone, where there is one.
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      : Promise.reject(new DOMException("No camera here.", "NotFoundError"));

    request
      .then(async (opened) => {
        stream = opened;
        const element = video.current;
        if (stopped || !element) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        element.srcObject = opened;
        await element.play();
        const read = await frameReader();
        if (stopped) {
          return;
        }
        setCamera("SCANNING");

        const tick = async () => {
          if (stopped) {
            return;
          }
          try {
            const text = await read(element);
            // The same code held in view is reported once, not seven times a
            // second; looking away and back reports it again.
            if (text && text !== last) {
              last = text;
              handler.current(text);
            } else if (!text) {
              last = "";
            }
          } catch {
            // One unreadable frame is nothing: read the next.
          }
          timer = setTimeout(tick, READ_EVERY_MS);
        };
        void tick();
      })
      .catch((error: unknown) => {
        if (stopped) {
          return;
        }
        const name = error instanceof DOMException ? error.name : "";
        setCamera(
          name === "NotAllowedError" || name === "SecurityError"
            ? "DENIED"
            : "UNAVAILABLE",
        );
      });

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (camera === "DENIED" || camera === "UNAVAILABLE") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center">
        <CameraOff className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">
          {camera === "DENIED"
            ? "The camera is not allowed on this page"
            : "No camera could be used"}
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {camera === "DENIED"
            ? "Allow the camera for this site in your browser's settings and try again, or type the number below."
            : "Type the sticker's number below instead."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-lg bg-surface-muted">
        <video
          ref={video}
          className="size-full object-cover"
          playsInline
          muted
          aria-label="The camera's view"
        />
        {/* A frame to aim with. The whole view is read, not only the frame. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-8 rounded-lg border-2 border-on-solid outline outline-1 outline-overlay"
        />
        {camera === "STARTING" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-muted text-muted-foreground">
            <Camera className="size-6 animate-pulse" aria-hidden />
            <span className="text-sm">Starting the camera…</span>
          </div>
        ) : null}
      </div>
      <p className="text-center text-sm text-muted-foreground" role="status">
        {camera === "SCANNING"
          ? "Hold the sticker's QR code inside the frame."
          : "Your browser may ask to use the camera."}
      </p>
    </div>
  );
}

/**
 * A dialog that reads a sticker: by camera, or by its number typed in.
 * `onCode` is given the code the System looks up (`stickerCodeFromScan`), and
 * only one that could be a sticker's: a camera pointed at some other QR code
 * is told so here, and nothing is sent.
 *
 * It closes on the first sticker read. With `continuous` it stays open and
 * reads one after another, for taking a box of stickers into stock; `status`
 * then says what became of the last one.
 */
export function StickerScanDialog({
  open,
  onOpenChange,
  title = "Scan the sticker",
  description = "Point the camera at the QR code on the sticker.",
  continuous = false,
  status,
  onCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  continuous?: boolean;
  /** Beneath the camera: what became of the last sticker read. */
  status?: ReactNode;
  onCode: (code: string) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function close(next: boolean) {
    if (!next) {
      setTyped("");
      setProblem(null);
    }
    onOpenChange(next);
  }

  function accept(text: string, from: "camera" | "typed") {
    const code = stickerCodeFromScan(text);
    if (!looksLikeStickerCode(code)) {
      setProblem(
        from === "camera"
          ? "That QR code is not a sticker's. Point the camera at the code on the sticker."
          : "That is not a sticker's number. Check it against the sticker.",
      );
      return;
    }
    navigator.vibrate?.(60);
    if (continuous) {
      setTyped("");
      setProblem(null);
    } else {
      close(false);
    }
    onCode(code);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (typed.trim()) {
      accept(typed, "typed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the camera is off once it closes. */}
        {open ? <QrScanner onRead={(text) => accept(text, "camera")} /> : null}
        {problem ? (
          <Notice tone="caution" title="Not a sticker" role="alert">
            {problem}
          </Notice>
        ) : (
          status
        )}
        <form
          onSubmit={submit}
          className="grid gap-2 border-t border-line pt-4"
          noValidate
        >
          <Field
            label="Or type the sticker's number"
            htmlFor={id}
            hint="For when the camera cannot read it."
          >
            <TextInput
              id={id}
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setProblem(null);
              }}
            />
          </Field>
          <div>
            <Button
              type="submit"
              variant="secondary"
              disabled={typed.trim().length === 0}
            >
              Use this number
            </Button>
          </div>
        </form>
        {continuous ? (
          <DialogFooter>
            <Button type="button" onClick={() => close(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The button that opens the scanner, with the same icon wherever it is used. */
export function ScanButton({
  children = "Scan the sticker",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button type="button" {...props}>
      <ScanLine aria-hidden />
      {children}
    </Button>
  );
}
