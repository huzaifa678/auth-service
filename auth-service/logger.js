import winston from "winston";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";

const logger = winston.createLogger({
  level: "info",

  defaultMeta: {
    service: process.env.OTEL_SERVICE_NAME || "auth-service",
  },

  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf((info) => {
      return `[WINSTON] ${info.timestamp} ${info.level}: ${info.message}`;
    })
  ),

  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3()
  ],
});

export default logger;