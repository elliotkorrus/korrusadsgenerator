type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta || {}),
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, any>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log("error", msg, meta),
  debug: (msg: string, meta?: Record<string, any>) => {
    if (process.env.LOG_LEVEL === "debug") log("debug", msg, meta);
  },
};
