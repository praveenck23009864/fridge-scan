
import { useEffect, useRef, useState } from "react";
import "./CameraCapture.css";

export type FridgePhoto = {
  id: string;
  file: File;
  previewUrl: string;
  source: "camera" | "sample" | "upload";
};

type Props = {
  onPhotosChange: (photos: FridgePhoto[]) => void;
};

const MAX_PHOTOS = 3;

const SAMPLES = [
  "/sample-photos/fridge-1.jpg",
  "/sample-photos/fridge-2.jpg",
  "/sample-photos/fridge-3.jpg",
];

export default function CameraCapture({
  onPhotosChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const photosRef = useRef<FridgePhoto[]>([]);

  const [photos, setPhotos] = useState<FridgePhoto[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);

  useEffect(() => {
    photosRef.current = photos;
    onPhotosChange(photos);
  }, [photos, onPhotosChange]);

  function stopCamera() {
    operationRef.current += 1;
    streamRef.current?.getTracks().forEach(
      (track) => track.stop()
    );

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setRetakeIndex(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      streamRef.current?.getTracks().forEach(
        (track) => track.stop()
      );

      photosRef.current.forEach((photo) =>
        URL.revokeObjectURL(photo.previewUrl)
      );
    };
  }, []);

  async function openCamera(index: number | null = null) {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera is unavailable. Use HTTPS, localhost, or sample photos."
      );
      return;
    }

    setBusy(true);

    try {
      stopCamera();

      const operation = operationRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (!mountedRef.current || operation !== operationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setRetakeIndex(index);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (mountedRef.current && operation === operationRef.current) setCameraActive(true);
    } catch (err) {
      stopCamera();

      const message =
        err instanceof DOMException ? err.name : "";

      if (message === "NotAllowedError") {
        setError(
          "Camera permission denied. Allow access in browser settings or use sample photos."
        );
      } else if (message === "NotFoundError") {
        setError("No camera found. Try sample photos.");
      } else {
        setError(
          "Could not start the camera. Check whether another app is using it."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is not ready. Try again.");
      return;
    }

    setBusy(true);
    const operation = ++operationRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setBusy(false);
      setError("Unable to capture image.");
      return;
    }

    context.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!mountedRef.current || operation !== operationRef.current) return;
        setBusy(false);
        if (!blob) {
          setError("Photo capture failed. Please retry.");
          return;
        }

        const file = new File(
          [blob],
          `fridge-${Date.now()}.jpg`,
          { type: "image/jpeg" }
        );

        const photo: FridgePhoto = {
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          source: "camera",
        };

        setPhotos((previous) => {
          if (retakeIndex !== null) {
            const updated = [...previous];
            const old = updated[retakeIndex];

            if (!old) {
              URL.revokeObjectURL(photo.previewUrl);
              return previous;
            }

            URL.revokeObjectURL(old.previewUrl);
            updated[retakeIndex] = photo;
            return updated;
          }

          if (previous.length >= MAX_PHOTOS) {
            URL.revokeObjectURL(photo.previewUrl);
            return previous;
          }

          return [...previous, photo];
        });

        stopCamera();
        setError("");
      },
      "image/jpeg",
      0.85
    );
  }

  function deletePhoto(id: string) {
    stopCamera();
    setBusy(false);
    setPhotos((previous) => {
      const photo = previous.find((p) => p.id === id);

      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
      }

      return previous.filter((p) => p.id !== id);
    });
  }

  async function loadSamples() {
    setError("");

    if (photos.length >= MAX_PHOTOS) {
      setError("Maximum 3 photos allowed.");
      return;
    }

    setBusy(true);
    const newPhotos: FridgePhoto[] = [];

    try {
      const remaining = MAX_PHOTOS - photos.length;


      for (const path of SAMPLES.slice(0, remaining)) {
        const response = await fetch(path);

        if (!response.ok) {
          throw new Error("Sample photos not found.");
        }

        const blob = await response.blob();

        if (!blob.type.startsWith("image/")) {
          throw new Error("Invalid sample image.");
        }

        const file = new File(
          [blob],
          path.split("/").pop() || "sample.jpg",
          { type: blob.type }
        );

        newPhotos.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          source: "sample",
        });
      }

      if (!mountedRef.current) {
        newPhotos.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
        return;
      }
      setPhotos((previous) => {
        const available = MAX_PHOTOS - previous.length;
        const accepted = newPhotos.slice(0, available);

        newPhotos.slice(available).forEach((photo) =>
          URL.revokeObjectURL(photo.previewUrl)
        );

        return [...previous, ...accepted];
      });
    } catch {
      newPhotos.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
      setError(
        "Sample photos are missing. Check public/sample-photos."
      );
    } finally {
      setBusy(false);
    }
  }

  function clearPhotos() {
    stopCamera();
    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    photosRef.current = [];
    setPhotos([]);
    setError("");
    setBusy(false);
  }

  function acceptFiles(files: File[]) {
    if (busy) return;
            if (files.length + photos.length > MAX_PHOTOS || files.some(file =>
              !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
              setError("Select up to 3 JPEG, PNG or WebP photos, each at most 5 MB.");
              return;
            }
            setError("");
            setPhotos(previous => [...previous, ...files.map(file => ({
              id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), source: "upload" as const,
            }))]);
  }

  return (
    <section className="camera-panel">
      <h2>Fridge photos</h2>
      <p>
        Capture your fridge shelves and door.
        Maximum {MAX_PHOTOS} photos.
      </p>

      <p aria-live="polite">
        Photos selected: {photos.length}/{MAX_PHOTOS}
      </p>

      <p className="photo-privacy">Photos stay in this page until deleted or the page is closed or reloaded. Saving a scan saves ingredient text, not photos. Analysis sends photos to the AI provider; provider retention may differ.</p>
      {photos.length > 0 && <button type="button" onClick={clearPhotos} disabled={busy}>Delete all photos</button>}
      <div className="upload-zone" onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); acceptFiles(Array.from(event.dataTransfer.files));}}>
      <span className="upload-symbol" aria-hidden="true">&#8593;</span>
      <h3>A fresh look inside your fridge</h3><p>Drop your photos here, or choose files below.</p>
      <label>
        Upload Photos
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple
          disabled={busy || photos.length >= MAX_PHOTOS}
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }} />
      </label>
      <small>1-3 photos &middot; JPEG, PNG or WebP &middot; Up to 5 MB each</small>
      </div>
      <video
        ref={videoRef}
        className="camera-video"
        aria-label="Live camera preview"
        autoPlay
        muted
        playsInline
        style={{ display: cameraActive ? "block" : "none" }}
      />

      {cameraActive ? (
        <div className="camera-actions">
          <button
            type="button"
            onClick={capturePhoto}
            disabled={busy}
          >
            Capture Photo
          </button>

          <button
            type="button"
            className="camera-secondary"
            onClick={() => { stopCamera(); setBusy(false); }}
          >
            Cancel Camera
          </button>
        </div>
      ) : (
        <div className="camera-actions">
          <button
            type="button"
            disabled={busy || photos.length >= MAX_PHOTOS}
            onClick={() => void openCamera()}
          >
            Open Camera
          </button>

          <button
            type="button"
            className="camera-secondary"
            disabled={busy || photos.length >= MAX_PHOTOS}
            onClick={() => void loadSamples()}
          >
            No camera? Use Sample Photos
          </button>
        </div>
      )}

      {error && (
        <p className="camera-error" role="alert">
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((photo, index) => (
            <article className="photo-card" key={photo.id}>
              <img
                src={photo.previewUrl}
                alt={`Fridge photo ${index + 1}`}
              />

              <p>
                Photo {index + 1} ({photo.source})
              </p>

              <div className="photo-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openCamera(index)}
                >
                  Retake
                </button>

                <button
                  type="button"
                  className="camera-delete"
                  onClick={() => deletePhoto(photo.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <p className="camera-ready">
          ✓ {photos.length} photo(s) ready for AI analysis.
        </p>
      )}
    </section>
  );
}
