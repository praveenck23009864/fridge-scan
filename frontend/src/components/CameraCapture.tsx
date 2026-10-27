
import { useEffect, useRef, useState } from "react";
import "./CameraCapture.css";

export type FridgePhoto = {
  id: string;
  file: File;
  previewUrl: string;
  source: "camera" | "sample";
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
    return () => {
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

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setRetakeIndex(index);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
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

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setError("Unable to capture image.");
      return;
    }

    context.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
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

    try {
      const remaining = MAX_PHOTOS - photos.length;
      const newPhotos: FridgePhoto[] = [];

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

      setPhotos((previous) => {
        const available = MAX_PHOTOS - previous.length;
        const accepted = newPhotos.slice(0, available);

        newPhotos.slice(available).forEach((photo) =>
          URL.revokeObjectURL(photo.previewUrl)
        );

        return [...previous, ...accepted];
      });
    } catch {
      setError(
        "Sample photos are missing. Check public/sample-photos."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="camera-panel">
      <h2>📷 Scan Your Fridge</h2>
      <p>
        Capture your fridge shelves and door.
        Maximum {MAX_PHOTOS} photos.
      </p>

      <p aria-live="polite">
        Photos selected: {photos.length}/{MAX_PHOTOS}
      </p>

      <video
        ref={videoRef}
        className="camera-video"
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
            onClick={stopCamera}
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
