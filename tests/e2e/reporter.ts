import { rmSync } from "node:fs";
import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
// Error messages, HTML/trace bodies, cookies and request headers can contain tokens.
// Emit only titles/status and source locations. Detailed safe assertions live in tests.
export default class SafeReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    // Playwright may create a DOM/error snapshot even when tracing is disabled.
    // Retain only our explicitly sanitized diagnostics.
    for (const attachment of result.attachments) {
      if (attachment.name !== "safe-diagnostics" && attachment.path)
        rmSync(attachment.path, { force: true });
    }
    console.log(`${result.status.toUpperCase()}: ${test.title}`);
    for (const attachment of result.attachments) {
      if (attachment.name === "safe-diagnostics" && attachment.body)
        console.log(`  Diagnostics: ${attachment.body.toString()}`);
    }
    for (const error of result.errors) {
      const categories = [
        "element(s) not found",
        "not enabled",
        "strict mode violation",
        "did not change its checked state",
        "Test timeout",
        "TimeoutError",
      ];
      const matched = categories.filter((category) =>
        (error.message ?? "").includes(category),
      );
      if (matched.length)
        console.log(`  Failure category: ${matched.join(", ")}`);
      const locations = (error.stack ?? "").match(
        /(?:helpers|fixtures|workflows\.spec|smoke\.spec)\.ts:\d+:\d+/g,
      );
      if (locations)
        console.log(`  Failed at: ${[...new Set(locations)].join(", ")}`);
    }
    if (result.status !== "passed")
      console.log(
        `  ${test.location.file.split("/").pop()}:${test.location.line}; see private sanitized diagnostics`,
      );
  }
  onError() {
    console.error(
      "E2E infrastructure failed; inspect the private local run logs.",
    );
  }
  onEnd(result: FullResult) {
    console.log(`E2E result: ${result.status}`);
  }
}
