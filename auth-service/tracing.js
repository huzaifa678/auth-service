import "dotenv/config";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "auth-service";

const logExporter = new OTLPLogExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ||
    "http://localhost:43180/v1/logs",
});

const logProcessor = new BatchLogRecordProcessor(logExporter);

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
  }),

  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      "http://localhost:43180/v1/traces",
  }),

  logRecordProcessors: [logProcessor],

  instrumentations: [
    getNodeAutoInstrumentations(),

    new WinstonInstrumentation({
      logHook: (_span, record) => {
        console.log("Raw record:", JSON.stringify(record, null, 2));
      },
    }),
  ],
});

try {
  sdk.start();
  console.log("\nSDK STARTED SUCCESSFULLY\n");
} catch (err) {
  console.error("[SDK FAILED:", err);
}

process.on("SIGINT", async () => {
  console.log("\nSHUTDOWN TRIGGERED (SIGINT)");
  await sdk.shutdown();
  console.log("SHUTDOWN COMPLETE");
});

process.on("SIGTERM", async () => {
  console.log("\nSHUTDOWN TRIGGERED (SIGTERM)");
  await sdk.shutdown();
  console.log("SHUTDOWN COMPLETE");
});