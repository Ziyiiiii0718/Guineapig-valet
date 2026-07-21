"use client";

/* eslint-disable @next/next/no-img-element -- Local blob previews cannot be optimized by next/image. */

import { useEffect, useRef, useState, useTransition } from "react";
import {
  finalizePhotoUploadAction,
  initializePhotoUploadsAction,
  type PhotoUploadFileRequest,
} from "@/app/actions/photos";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseExifTakenAtFromArrayBuffer } from "@/lib/photos/exif";
import {
  getUserPhotoBatchValidationError,
  getUserPhotoValidationError,
  USER_PHOTO_ALLOWED_TYPES,
  USER_PHOTO_BUCKET,
  USER_PHOTO_MAX_BATCH_SIZE,
  USER_PHOTO_MAX_SIZE_BYTES,
} from "@/lib/photos/upload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type UploadStatus =
  "ready" | "reading" | "invalid" | "uploading" | "uploaded" | "failed";

type SelectedPhoto = {
  error: string | null;
  file: File;
  height: number | null;
  id: string;
  path: string | null;
  previewUrl: string;
  status: UploadStatus;
  takenAt: string | null;
  width: number | null;
};

const ACCEPTED_TYPES = USER_PHOTO_ALLOWED_TYPES.join(",");

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTone(status: UploadStatus) {
  if (status === "uploaded") {
    return "success";
  }

  if (status === "failed" || status === "invalid") {
    return "warning";
  }

  return "neutral";
}

function statusLabel(status: UploadStatus) {
  if (status === "reading") {
    return "checking";
  }

  return status;
}

function readImageDimensions(url: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.onerror = () => reject(new Error("Could not read image dimensions."));
    image.src = url;
  });
}

async function buildSelectedPhoto(file: File): Promise<SelectedPhoto> {
  const id = crypto.randomUUID();
  const previewUrl = URL.createObjectURL(file);
  const validationError = getUserPhotoValidationError({
    size: file.size,
    type: file.type,
  });

  if (validationError) {
    return {
      error: validationError,
      file,
      height: null,
      id,
      path: null,
      previewUrl,
      status: "invalid",
      takenAt: null,
      width: null,
    };
  }

  try {
    const [{ height, width }, buffer] = await Promise.all([
      readImageDimensions(previewUrl),
      file.type === "image/jpeg"
        ? file.arrayBuffer()
        : Promise.resolve(new ArrayBuffer(0)),
    ]);

    return {
      error: null,
      file,
      height,
      id,
      path: null,
      previewUrl,
      status: "ready",
      takenAt:
        file.type === "image/jpeg"
          ? parseExifTakenAtFromArrayBuffer(buffer)
          : null,
      width,
    };
  } catch {
    return {
      error: "We could not read this image safely.",
      file,
      height: null,
      id,
      path: null,
      previewUrl,
      status: "invalid",
      takenAt: null,
      width: null,
    };
  }
}

export function PhotoUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) =>
        URL.revokeObjectURL(photo.previewUrl),
      );
    };
  }, []);

  async function addFiles(fileList: FileList | File[]) {
    setMessage(null);

    const files = Array.from(fileList);
    const activeCount = photos.filter(
      (photo) => photo.status !== "uploaded",
    ).length;
    const batchError = getUserPhotoBatchValidationError(
      activeCount + files.length,
    );

    if (batchError) {
      setMessage(batchError);
      return;
    }

    const readingPhotos = files.map((file) => ({
      error: null,
      file,
      height: null,
      id: crypto.randomUUID(),
      path: null,
      previewUrl: URL.createObjectURL(file),
      status: "reading" as const,
      takenAt: null,
      width: null,
    }));

    setPhotos((current) => [...current, ...readingPhotos]);

    const completed = await Promise.all(
      readingPhotos.map(async (photo) => {
        URL.revokeObjectURL(photo.previewUrl);
        return buildSelectedPhoto(photo.file);
      }),
    );

    setPhotos((current) =>
      current.map((photo) => {
        const replacement = completed.find((item) => item.file === photo.file);
        return replacement ?? photo;
      }),
    );
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);

      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return current.filter((photo) => photo.id !== id);
    });
  }

  async function uploadPhoto(photo: SelectedPhoto) {
    const request: PhotoUploadFileRequest = {
      clientId: photo.id,
      height: photo.height,
      mimeType: photo.file.type,
      originalFileName: photo.file.name,
      size: photo.file.size,
      takenAt: photo.takenAt,
      width: photo.width,
    };
    const [initResult] = await initializePhotoUploadsAction([request]);

    if (
      !initResult ||
      initResult.status === "error" ||
      !initResult.path ||
      !initResult.token
    ) {
      setPhotos((current) =>
        current.map((item) =>
          item.id === photo.id
            ? {
                ...item,
                error:
                  initResult?.message ??
                  "We could not prepare that upload. Please try again.",
                status: "failed",
              }
            : item,
        ),
      );
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from(USER_PHOTO_BUCKET)
      .uploadToSignedUrl(initResult.path, initResult.token, photo.file, {
        contentType: photo.file.type,
      });

    if (uploadError) {
      setPhotos((current) =>
        current.map((item) =>
          item.id === photo.id
            ? {
                ...item,
                error: "We could not upload this photo. Please try again.",
                path: initResult.path ?? null,
                status: "failed",
              }
            : item,
        ),
      );
      return;
    }

    const finalResult = await finalizePhotoUploadAction({
      ...request,
      path: initResult.path,
    });

    setPhotos((current) =>
      current.map((item) =>
        item.id === photo.id
          ? {
              ...item,
              error:
                finalResult.status === "failed" ? finalResult.message : null,
              path: initResult.path ?? null,
              status: finalResult.status,
            }
          : item,
      ),
    );
  }

  function uploadReadyPhotos() {
    setMessage(null);
    const readyPhotos = photos.filter((photo) => photo.status === "ready");

    if (readyPhotos.length === 0) {
      setMessage("Choose at least one ready photo to upload.");
      return;
    }

    startTransition(async () => {
      setPhotos((current) =>
        current.map((photo) =>
          readyPhotos.some((ready) => ready.id === photo.id)
            ? { ...photo, error: null, status: "uploading" }
            : photo,
        ),
      );

      for (const photo of readyPhotos) {
        await uploadPhoto(photo);
      }
    });
  }

  function retryPhoto(photo: SelectedPhoto) {
    startTransition(async () => {
      setPhotos((current) =>
        current.map((item) =>
          item.id === photo.id
            ? { ...item, error: null, path: null, status: "uploading" }
            : item,
        ),
      );
      await uploadPhoto(photo);
    });
  }

  const uploadedPhotos = photos.filter((photo) => photo.status === "uploaded");
  const hasUploadablePhotos = photos.some((photo) => photo.status === "ready");

  return (
    <div className="space-y-5">
      <Card className="photo-upload-card">
        <div
          className={cn(
            "photo-drop-zone focus-ring",
            dragActive && "photo-drop-zone-active",
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void addFiles(event.dataTransfer.files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <span className="photo-upload-icon" aria-hidden="true" />
          <div>
            <h2 className="heading-section">Choose private photos</h2>
            <p className="text-secondary mt-2 text-sm leading-6">
              Click or drag images here. JPEG, PNG, or WEBP only, up to{" "}
              {formatBytes(USER_PHOTO_MAX_SIZE_BYTES)} each and{" "}
              {USER_PHOTO_MAX_BATCH_SIZE} files per batch.
            </p>
          </div>
          <input
            ref={inputRef}
            accept={ACCEPTED_TYPES}
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                void addFiles(event.target.files);
              }
              event.target.value = "";
            }}
            type="file"
          />
        </div>

        <Alert tone="info" className="mt-5 text-sm">
          Your uploads are private to your account. They are saved for your
          photo library and are not sent to the future AI service yet.
        </Alert>

        {message ? (
          <Alert tone="warning" role="alert" className="mt-4 text-sm">
            {message}
          </Alert>
        ) : null}
      </Card>

      {photos.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="heading-section">Selected photos</h2>
              <p className="text-secondary mt-1 text-sm">
                Review the files before starting the upload.
              </p>
            </div>
            <Button
              disabled={isPending || !hasUploadablePhotos}
              onClick={uploadReadyPhotos}
            >
              {isPending ? "Uploading..." : "Start upload"}
            </Button>
          </div>

          <ul className="photo-selected-list mt-5">
            {photos.map((photo) => (
              <li key={photo.id} className="photo-selected-item">
                <img
                  alt=""
                  className="photo-selected-preview"
                  src={photo.previewUrl}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-bold">{photo.file.name}</h3>
                    <Badge tone={statusTone(photo.status)}>
                      {statusLabel(photo.status)}
                    </Badge>
                  </div>
                  <p className="text-secondary mt-1 text-sm">
                    {formatBytes(photo.file.size)}
                    {photo.width && photo.height
                      ? ` · ${photo.width} x ${photo.height}`
                      : ""}
                  </p>
                  {photo.error ? (
                    <p className="photo-error mt-2 text-sm">{photo.error}</p>
                  ) : null}
                </div>
                <div className="photo-selected-actions">
                  {photo.status === "failed" ? (
                    <Button
                      disabled={isPending}
                      onClick={() => retryPhoto(photo)}
                      variant="secondary"
                    >
                      Retry
                    </Button>
                  ) : null}
                  {photo.status !== "uploading" &&
                  photo.status !== "uploaded" ? (
                    <Button
                      disabled={isPending}
                      onClick={() => removePhoto(photo.id)}
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {uploadedPhotos.length > 0 ? (
        <Card>
          <h2 className="heading-section">Uploaded in this session</h2>
          <div className="photo-session-grid mt-5">
            {uploadedPhotos.map((photo) => (
              <img
                key={photo.id}
                alt=""
                className="photo-session-preview"
                src={photo.previewUrl}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
