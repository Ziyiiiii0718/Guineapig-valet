import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

async function fixture() {
  const items = Array.from({ length: 36 }, (_, id) => ({
    id,
    path: `potato/photo-${id}.png`,
    label: "potato",
    split: id < 27 ? "train" : "development",
    width: 1000,
    height: 500,
  }));
  const spec = {
    manifest_sha256: "synthetic-only",
    items,
    policy: { margin: 0.05 },
  };
  const payload = {
    spec,
    previews: items.map(() => "data:image/png;base64,synthetic"),
  };
  const template = readFileSync(
    new URL("./annotator.html", import.meta.url),
    "utf8",
  );
  const downloads = [],
    blobs = [];
  const dom = new JSDOM(
    template.replace("/*EXPERIMENT_DATA*/null", JSON.stringify(payload)),
    {
      runScripts: "dangerously",
      url: "https://synthetic.invalid/", // No resources/fetch enabled.
      beforeParse(window) {
        window.HTMLCanvasElement.prototype.getContext = () => ({
          clearRect() {},
          drawImage() {},
          fillRect() {},
          strokeRect() {},
        });
        window.HTMLCanvasElement.prototype.setPointerCapture = () => {};
        window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 500,
          height: 250,
        });
        window.Image = class {
          naturalWidth = 500;
          naturalHeight = 250;
          set src(value) {
            this.source = value;
            window.queueMicrotask(() => this.onload());
          }
        };
        window.confirm = () => true;
        window.Blob = Blob;
        window.URL.createObjectURL = (blob) => {
          blobs.push(blob);
          return "blob:synthetic";
        };
        window.URL.revokeObjectURL = () => {};
        window.HTMLAnchorElement.prototype.click = function () {
          downloads.push(this.download);
        };
      },
    },
  );
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  await tick();
  const document = dom.window.document;
  return { dom, document, tick, spec, downloads, blobs };
}

test("drag maps display coordinates to original pixels; save/export retains JSON", async () => {
  const f = await fixture();
  try {
    const canvas = f.document.getElementById("photo");
    canvas.dispatchEvent(
      new f.dom.window.MouseEvent("pointerdown", { clientX: 50, clientY: 25 }),
    );
    canvas.dispatchEvent(
      new f.dom.window.MouseEvent("pointermove", {
        clientX: 400,
        clientY: 200,
      }),
    );
    canvas.dispatchEvent(new f.dom.window.MouseEvent("pointerup"));
    assert.deepEqual(
      ["x1", "y1", "x2", "y2"].map((id) => f.document.getElementById(id).value),
      ["100", "50", "800", "400"],
    );
    f.document.getElementById("save").click();
    await f.tick();
    assert.match(f.document.getElementById("status").textContent, /1 \/ 36/);
    f.document.getElementById("export").click();
    assert.equal(f.downloads[0], "crop-annotations.json");
    const exported = JSON.parse(await f.blobs[0].text());
    assert.deepEqual(exported.boxes["potato/photo-0.png"], [100, 50, 800, 400]);
    assert.equal(exported.manifest_sha256, "synthetic-only");
  } finally {
    f.dom.window.close();
  }
});

test("numeric boxes reject invalid coordinates and clearing removes a saved box", async () => {
  const f = await fixture();
  try {
    for (const [id, value] of Object.entries({
      x1: "0",
      y1: "0",
      x2: "1001",
      y2: "400",
    })) {
      const field = f.document.getElementById(id);
      field.value = value;
      field.dispatchEvent(new f.dom.window.Event("input"));
    }
    assert.equal(f.document.getElementById("save").disabled, true);
    const right = f.document.getElementById("x2");
    right.value = "900";
    right.dispatchEvent(new f.dom.window.Event("input"));
    assert.equal(f.document.getElementById("save").disabled, false);
    f.document.getElementById("save").click();
    await f.tick();
    f.document.getElementById("previous").click();
    await f.tick();
    f.document.getElementById("clear").click();
    assert.match(f.document.getElementById("status").textContent, /0 \/ 36/);
  } finally {
    f.dom.window.close();
  }
});

test("resume restores valid boxes and rejects paths outside the selected cohort", async () => {
  const f = await fixture();
  try {
    const data = {
      version: 1,
      manifest_sha256: f.spec.manifest_sha256,
      policy: f.spec.policy,
      boxes: { "potato/photo-0.png": [100, 50, 800, 400] },
    };
    const input = f.document.getElementById("import");
    const send = async (value) => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [{ size: 100, text: async () => JSON.stringify(value) }],
      });
      input.dispatchEvent(new f.dom.window.Event("change"));
      await f.tick();
      await f.tick();
    };
    await send(data);
    assert.match(f.document.getElementById("status").textContent, /1 \/ 36/);
    data.boxes["held-out/not-allowed.png"] = [0, 0, 100, 100];
    await send(data);
    assert.match(
      f.document.getElementById("message").textContent,
      /Unknown photo/,
    );
    assert.match(f.document.getElementById("status").textContent, /1 \/ 36/);
  } finally {
    f.dom.window.close();
  }
});
