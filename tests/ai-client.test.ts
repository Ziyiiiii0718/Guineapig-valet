import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_CONFIG = {
  token: "test-server-token",
  url: "http://127.0.0.1:8000/",
};

async function loadClient(config: typeof TEST_CONFIG | null) {
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/ai/config", () => ({
    getAiServiceConfig: () => config,
  }));
  return import("@/lib/ai/client");
}

describe("AI service client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("fails gracefully when the service is not configured", async () => {
    const { requestImageEmbedding } = await loadClient(null);
    await expect(
      requestImageEmbedding({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ category: "service_unavailable" });
  });

  it("categorizes unreadable JSON as an invalid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("not-json", {
            headers: { "Content-Type": "text/plain" },
            status: 200,
          }),
      ),
    );
    const { requestImageEmbedding } = await loadClient(TEST_CONFIG);
    await expect(
      requestImageEmbedding({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ category: "invalid_response" });
  });

  it("sends raw bytes with server authentication and validates metadata", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        dimension: 512,
        embedding: [1, ...Array.from({ length: 511 }, () => 0)],
        model: "ViT-B-32-quickgelu",
        version: "openai",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { requestImageEmbedding } = await loadClient(TEST_CONFIG);
    await expect(
      requestImageEmbedding({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/jpeg",
      }),
    ).resolves.toMatchObject({ dimension: 512, version: "openai" });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8000/embed"),
      expect.objectContaining({
        headers: {
          Authorization: `Bearer ${TEST_CONFIG.token}`,
          "Content-Type": "image/jpeg",
        },
        method: "POST",
      }),
    );
  });
});
