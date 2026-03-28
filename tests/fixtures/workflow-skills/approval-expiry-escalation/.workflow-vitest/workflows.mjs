// biome-ignore-all lint: generated file
/* eslint-disable */
import { workflowEntrypoint } from 'workflow/runtime';

const workflowCode = `globalThis.__private_workflows = new Map();
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../../node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js
var require_ms = __commonJS({
  "../../../../node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js"(exports, module2) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module2.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(val));
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\\d+)?\\.?\\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?\$/i.exec(str);
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    __name(parse, "parse");
    function fmtShort(ms2) {
      var msAbs = Math.abs(ms2);
      if (msAbs >= d) {
        return Math.round(ms2 / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms2 / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms2 / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms2 / s) + "s";
      }
      return ms2 + "ms";
    }
    __name(fmtShort, "fmtShort");
    function fmtLong(ms2) {
      var msAbs = Math.abs(ms2);
      if (msAbs >= d) {
        return plural(ms2, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms2, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms2, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms2, msAbs, s, "second");
      }
      return ms2 + " ms";
    }
    __name(fmtLong, "fmtLong");
    function plural(ms2, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms2 / n) + " " + name + (isPlural ? "s" : "");
    }
    __name(plural, "plural");
  }
});

// ../../../../packages/utils/dist/time.js
var import_ms = __toESM(require_ms(), 1);

// ../../../../packages/core/dist/symbols.js
var WORKFLOW_CREATE_HOOK = /* @__PURE__ */ Symbol.for("WORKFLOW_CREATE_HOOK");
var WORKFLOW_SLEEP = /* @__PURE__ */ Symbol.for("WORKFLOW_SLEEP");

// ../../../../packages/core/dist/sleep.js
async function sleep(param) {
  const sleepFn = globalThis[WORKFLOW_SLEEP];
  if (!sleepFn) {
    throw new Error("\`sleep()\` can only be called inside a workflow function");
  }
  return sleepFn(param);
}
__name(sleep, "sleep");

// ../../../../packages/core/dist/workflow/create-hook.js
function createHook(options) {
  const createHookFn = globalThis[WORKFLOW_CREATE_HOOK];
  if (!createHookFn) {
    throw new Error("\`createHook()\` can only be called inside a workflow function");
  }
  return createHookFn(options);
}
__name(createHook, "createHook");

// ../../../../packages/workflow/dist/stdlib.js
var fetch = globalThis[/* @__PURE__ */ Symbol.for("WORKFLOW_USE_STEP")]("step//./packages/workflow/dist/stdlib//fetch");

// workflows/purchase-approval.ts
var notifyApprover = globalThis[/* @__PURE__ */ Symbol.for("WORKFLOW_USE_STEP")]("step//./workflows/purchase-approval//notifyApprover");
var recordDecision = globalThis[/* @__PURE__ */ Symbol.for("WORKFLOW_USE_STEP")]("step//./workflows/purchase-approval//recordDecision");
async function purchaseApproval(poNumber, amount, managerId, directorId) {
  await notifyApprover(poNumber, managerId, "approval-request");
  const managerHook = createHook(\`approval:po-\${poNumber}\`);
  const managerTimeout = sleep("48h");
  const managerResult = await Promise.race([
    managerHook,
    managerTimeout
  ]);
  if (managerResult !== void 0) {
    return recordDecision(poNumber, managerResult.approved ? "approved" : "rejected", managerId);
  }
  await notifyApprover(poNumber, directorId, "escalation-request");
  const directorHook = createHook(\`escalation:po-\${poNumber}\`);
  const directorTimeout = sleep("24h");
  const directorResult = await Promise.race([
    directorHook,
    directorTimeout
  ]);
  if (directorResult !== void 0) {
    return recordDecision(poNumber, directorResult.approved ? "approved" : "rejected", directorId);
  }
  await notifyApprover(poNumber, managerId, "auto-rejection-notice");
  return recordDecision(poNumber, "auto-rejected", "system");
}
__name(purchaseApproval, "purchaseApproval");
purchaseApproval.workflowId = "workflow//./workflows/purchase-approval//purchaseApproval";
globalThis.__private_workflows.set("workflow//./workflows/purchase-approval//purchaseApproval", purchaseApproval);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL21zQDIuMS4zL25vZGVfbW9kdWxlcy9tcy9pbmRleC5qcyIsICIuLi8uLi8uLi8uLi9wYWNrYWdlcy91dGlscy9zcmMvdGltZS50cyIsICIuLi8uLi8uLi8uLi9wYWNrYWdlcy9jb3JlL3NyYy9zeW1ib2xzLnRzIiwgIi4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvcmUvc3JjL3NsZWVwLnRzIiwgIi4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvcmUvc3JjL3dvcmtmbG93L2NyZWF0ZS1ob29rLnRzIiwgIi4uLy4uLy4uLy4uL3BhY2thZ2VzL3dvcmtmbG93L3NyYy9zdGRsaWIudHMiLCAid29ya2Zsb3dzL3B1cmNoYXNlLWFwcHJvdmFsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIEhlbHBlcnMuXG4gKi8gdmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHcgPSBkICogNztcbnZhciB5ID0gZCAqIDM2NS4yNTtcbi8qKlxuICogUGFyc2Ugb3IgZm9ybWF0IHRoZSBnaXZlbiBgdmFsYC5cbiAqXG4gKiBPcHRpb25zOlxuICpcbiAqICAtIGBsb25nYCB2ZXJib3NlIGZvcm1hdHRpbmcgW2ZhbHNlXVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcn0gdmFsXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAdGhyb3dzIHtFcnJvcn0gdGhyb3cgYW4gZXJyb3IgaWYgdmFsIGlzIG5vdCBhIG5vbi1lbXB0eSBzdHJpbmcgb3IgYSBudW1iZXJcbiAqIEByZXR1cm4ge1N0cmluZ3xOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsO1xuICAgIGlmICh0eXBlID09PSAnc3RyaW5nJyAmJiB2YWwubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gcGFyc2UodmFsKTtcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmIGlzRmluaXRlKHZhbCkpIHtcbiAgICAgICAgcmV0dXJuIG9wdGlvbnMubG9uZyA/IGZtdExvbmcodmFsKSA6IGZtdFNob3J0KHZhbCk7XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcigndmFsIGlzIG5vdCBhIG5vbi1lbXB0eSBzdHJpbmcgb3IgYSB2YWxpZCBudW1iZXIuIHZhbD0nICsgSlNPTi5zdHJpbmdpZnkodmFsKSk7XG59O1xuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi8gZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gICAgc3RyID0gU3RyaW5nKHN0cik7XG4gICAgaWYgKHN0ci5sZW5ndGggPiAxMDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgbWF0Y2ggPSAvXigtPyg/OlxcZCspP1xcLj9cXGQrKSAqKG1pbGxpc2Vjb25kcz98bXNlY3M/fG1zfHNlY29uZHM/fHNlY3M/fHN8bWludXRlcz98bWlucz98bXxob3Vycz98aHJzP3xofGRheXM/fGR8d2Vla3M/fHd8eWVhcnM/fHlycz98eSk/JC9pLmV4ZWMoc3RyKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgICB2YXIgdHlwZSA9IChtYXRjaFsyXSB8fCAnbXMnKS50b0xvd2VyQ2FzZSgpO1xuICAgIHN3aXRjaCh0eXBlKXtcbiAgICAgICAgY2FzZSAneWVhcnMnOlxuICAgICAgICBjYXNlICd5ZWFyJzpcbiAgICAgICAgY2FzZSAneXJzJzpcbiAgICAgICAgY2FzZSAneXInOlxuICAgICAgICBjYXNlICd5JzpcbiAgICAgICAgICAgIHJldHVybiBuICogeTtcbiAgICAgICAgY2FzZSAnd2Vla3MnOlxuICAgICAgICBjYXNlICd3ZWVrJzpcbiAgICAgICAgY2FzZSAndyc6XG4gICAgICAgICAgICByZXR1cm4gbiAqIHc7XG4gICAgICAgIGNhc2UgJ2RheXMnOlxuICAgICAgICBjYXNlICdkYXknOlxuICAgICAgICBjYXNlICdkJzpcbiAgICAgICAgICAgIHJldHVybiBuICogZDtcbiAgICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICBjYXNlICdob3VyJzpcbiAgICAgICAgY2FzZSAnaHJzJzpcbiAgICAgICAgY2FzZSAnaHInOlxuICAgICAgICBjYXNlICdoJzpcbiAgICAgICAgICAgIHJldHVybiBuICogaDtcbiAgICAgICAgY2FzZSAnbWludXRlcyc6XG4gICAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICAgIGNhc2UgJ21pbnMnOlxuICAgICAgICBjYXNlICdtaW4nOlxuICAgICAgICBjYXNlICdtJzpcbiAgICAgICAgICAgIHJldHVybiBuICogbTtcbiAgICAgICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICAgIGNhc2UgJ3NlY3MnOlxuICAgICAgICBjYXNlICdzZWMnOlxuICAgICAgICBjYXNlICdzJzpcbiAgICAgICAgICAgIHJldHVybiBuICogcztcbiAgICAgICAgY2FzZSAnbWlsbGlzZWNvbmRzJzpcbiAgICAgICAgY2FzZSAnbWlsbGlzZWNvbmQnOlxuICAgICAgICBjYXNlICdtc2Vjcyc6XG4gICAgICAgIGNhc2UgJ21zZWMnOlxuICAgICAgICBjYXNlICdtcyc6XG4gICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxufVxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqLyBmdW5jdGlvbiBmbXRTaG9ydChtcykge1xuICAgIHZhciBtc0FicyA9IE1hdGguYWJzKG1zKTtcbiAgICBpZiAobXNBYnMgPj0gZCkge1xuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICAgIH1cbiAgICBpZiAobXNBYnMgPj0gaCkge1xuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGgpICsgJ2gnO1xuICAgIH1cbiAgICBpZiAobXNBYnMgPj0gbSkge1xuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICAgIH1cbiAgICBpZiAobXNBYnMgPj0gcykge1xuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICAgIH1cbiAgICByZXR1cm4gbXMgKyAnbXMnO1xufVxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovIGZ1bmN0aW9uIGZtdExvbmcobXMpIHtcbiAgICB2YXIgbXNBYnMgPSBNYXRoLmFicyhtcyk7XG4gICAgaWYgKG1zQWJzID49IGQpIHtcbiAgICAgICAgcmV0dXJuIHBsdXJhbChtcywgbXNBYnMsIGQsICdkYXknKTtcbiAgICB9XG4gICAgaWYgKG1zQWJzID49IGgpIHtcbiAgICAgICAgcmV0dXJuIHBsdXJhbChtcywgbXNBYnMsIGgsICdob3VyJyk7XG4gICAgfVxuICAgIGlmIChtc0FicyA+PSBtKSB7XG4gICAgICAgIHJldHVybiBwbHVyYWwobXMsIG1zQWJzLCBtLCAnbWludXRlJyk7XG4gICAgfVxuICAgIGlmIChtc0FicyA+PSBzKSB7XG4gICAgICAgIHJldHVybiBwbHVyYWwobXMsIG1zQWJzLCBzLCAnc2Vjb25kJyk7XG4gICAgfVxuICAgIHJldHVybiBtcyArICcgbXMnO1xufVxuLyoqXG4gKiBQbHVyYWxpemF0aW9uIGhlbHBlci5cbiAqLyBmdW5jdGlvbiBwbHVyYWwobXMsIG1zQWJzLCBuLCBuYW1lKSB7XG4gICAgdmFyIGlzUGx1cmFsID0gbXNBYnMgPj0gbiAqIDEuNTtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG4pICsgJyAnICsgbmFtZSArIChpc1BsdXJhbCA/ICdzJyA6ICcnKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0cmluZ1ZhbHVlIH0gZnJvbSAnbXMnO1xuaW1wb3J0IG1zIGZyb20gJ21zJztcblxuLyoqXG4gKiBQYXJzZXMgYSBkdXJhdGlvbiBwYXJhbWV0ZXIgKHN0cmluZywgbnVtYmVyLCBvciBEYXRlKSBhbmQgcmV0dXJucyBhIERhdGUgb2JqZWN0XG4gKiByZXByZXNlbnRpbmcgd2hlbiB0aGUgZHVyYXRpb24gc2hvdWxkIGVsYXBzZS5cbiAqXG4gKiAtIEZvciBzdHJpbmdzOiBQYXJzZXMgZHVyYXRpb24gc3RyaW5ncyBsaWtlIFwiMXNcIiwgXCI1bVwiLCBcIjFoXCIsIGV0Yy4gdXNpbmcgdGhlIGBtc2AgbGlicmFyeVxuICogLSBGb3IgbnVtYmVyczogVHJlYXRzIGFzIG1pbGxpc2Vjb25kcyBmcm9tIG5vd1xuICogLSBGb3IgRGF0ZSBvYmplY3RzOiBSZXR1cm5zIHRoZSBkYXRlIGRpcmVjdGx5IChoYW5kbGVzIGJvdGggRGF0ZSBpbnN0YW5jZXMgYW5kIGRhdGUtbGlrZSBvYmplY3RzIGZyb20gZGVzZXJpYWxpemF0aW9uKVxuICpcbiAqIEBwYXJhbSBwYXJhbSAtIFRoZSBkdXJhdGlvbiBwYXJhbWV0ZXIgKFN0cmluZ1ZhbHVlLCBEYXRlLCBvciBudW1iZXIgb2YgbWlsbGlzZWNvbmRzKVxuICogQHJldHVybnMgQSBEYXRlIG9iamVjdCByZXByZXNlbnRpbmcgd2hlbiB0aGUgZHVyYXRpb24gc2hvdWxkIGVsYXBzZVxuICogQHRocm93cyB7RXJyb3J9IElmIHRoZSBwYXJhbWV0ZXIgaXMgaW52YWxpZCBvciBjYW5ub3QgYmUgcGFyc2VkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUR1cmF0aW9uVG9EYXRlKHBhcmFtOiBTdHJpbmdWYWx1ZSB8IERhdGUgfCBudW1iZXIpOiBEYXRlIHtcbiAgaWYgKHR5cGVvZiBwYXJhbSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBkdXJhdGlvbk1zID0gbXMocGFyYW0pO1xuICAgIGlmICh0eXBlb2YgZHVyYXRpb25NcyAhPT0gJ251bWJlcicgfHwgZHVyYXRpb25NcyA8IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYEludmFsaWQgZHVyYXRpb246IFwiJHtwYXJhbX1cIi4gRXhwZWN0ZWQgYSB2YWxpZCBkdXJhdGlvbiBzdHJpbmcgbGlrZSBcIjFzXCIsIFwiMW1cIiwgXCIxaFwiLCBldGMuYFxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBEYXRlKERhdGUubm93KCkgKyBkdXJhdGlvbk1zKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcGFyYW0gPT09ICdudW1iZXInKSB7XG4gICAgaWYgKHBhcmFtIDwgMCB8fCAhTnVtYmVyLmlzRmluaXRlKHBhcmFtKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgSW52YWxpZCBkdXJhdGlvbjogJHtwYXJhbX0uIEV4cGVjdGVkIGEgbm9uLW5lZ2F0aXZlIGZpbml0ZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzLmBcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgRGF0ZShEYXRlLm5vdygpICsgcGFyYW0pO1xuICB9IGVsc2UgaWYgKFxuICAgIHBhcmFtIGluc3RhbmNlb2YgRGF0ZSB8fFxuICAgIChwYXJhbSAmJlxuICAgICAgdHlwZW9mIHBhcmFtID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIChwYXJhbSBhcyBhbnkpLmdldFRpbWUgPT09ICdmdW5jdGlvbicpXG4gICkge1xuICAgIC8vIEhhbmRsZSBib3RoIERhdGUgaW5zdGFuY2VzIGFuZCBkYXRlLWxpa2Ugb2JqZWN0cyAoZnJvbSBkZXNlcmlhbGl6YXRpb24pXG4gICAgcmV0dXJuIHBhcmFtIGluc3RhbmNlb2YgRGF0ZSA/IHBhcmFtIDogbmV3IERhdGUoKHBhcmFtIGFzIGFueSkuZ2V0VGltZSgpKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgSW52YWxpZCBkdXJhdGlvbiBwYXJhbWV0ZXIuIEV4cGVjdGVkIGEgZHVyYXRpb24gc3RyaW5nLCBudW1iZXIgKG1pbGxpc2Vjb25kcyksIG9yIERhdGUgb2JqZWN0LmBcbiAgICApO1xuICB9XG59XG4iLCAiZXhwb3J0IGNvbnN0IFdPUktGTE9XX1VTRV9TVEVQID0gU3ltYm9sLmZvcignV09SS0ZMT1dfVVNFX1NURVAnKTtcbmV4cG9ydCBjb25zdCBXT1JLRkxPV19DUkVBVEVfSE9PSyA9IFN5bWJvbC5mb3IoJ1dPUktGTE9XX0NSRUFURV9IT09LJyk7XG5leHBvcnQgY29uc3QgV09SS0ZMT1dfU0xFRVAgPSBTeW1ib2wuZm9yKCdXT1JLRkxPV19TTEVFUCcpO1xuZXhwb3J0IGNvbnN0IFdPUktGTE9XX0NPTlRFWFQgPSBTeW1ib2wuZm9yKCdXT1JLRkxPV19DT05URVhUJyk7XG5leHBvcnQgY29uc3QgV09SS0ZMT1dfR0VUX1NUUkVBTV9JRCA9IFN5bWJvbC5mb3IoJ1dPUktGTE9XX0dFVF9TVFJFQU1fSUQnKTtcbmV4cG9ydCBjb25zdCBTVEFCTEVfVUxJRCA9IFN5bWJvbC5mb3IoJ1dPUktGTE9XX1NUQUJMRV9VTElEJyk7XG5leHBvcnQgY29uc3QgU1RSRUFNX05BTUVfU1lNQk9MID0gU3ltYm9sLmZvcignV09SS0ZMT1dfU1RSRUFNX05BTUUnKTtcbmV4cG9ydCBjb25zdCBTVFJFQU1fVFlQRV9TWU1CT0wgPSBTeW1ib2wuZm9yKCdXT1JLRkxPV19TVFJFQU1fVFlQRScpO1xuZXhwb3J0IGNvbnN0IEJPRFlfSU5JVF9TWU1CT0wgPSBTeW1ib2wuZm9yKCdCT0RZX0lOSVQnKTtcbmV4cG9ydCBjb25zdCBXRUJIT09LX1JFU1BPTlNFX1dSSVRBQkxFID0gU3ltYm9sLmZvcihcbiAgJ1dFQkhPT0tfUkVTUE9OU0VfV1JJVEFCTEUnXG4pO1xuXG4vKipcbiAqIFN5bWJvbCB1c2VkIHRvIHN0b3JlIHRoZSBjbGFzcyByZWdpc3RyeSBvbiBnbG9iYWxUaGlzIGluIHdvcmtmbG93IG1vZGUuXG4gKiBUaGlzIGFsbG93cyB0aGUgZGVzZXJpYWxpemVyIHRvIGZpbmQgY2xhc3NlcyBieSBjbGFzc0lkIGluIHRoZSBWTSBjb250ZXh0LlxuICovXG5leHBvcnQgY29uc3QgV09SS0ZMT1dfQ0xBU1NfUkVHSVNUUlkgPSBTeW1ib2wuZm9yKCd3b3JrZmxvdy1jbGFzcy1yZWdpc3RyeScpO1xuIiwgImltcG9ydCB0eXBlIHsgU3RyaW5nVmFsdWUgfSBmcm9tICdtcyc7XG5pbXBvcnQgeyBXT1JLRkxPV19TTEVFUCB9IGZyb20gJy4vc3ltYm9scy5qcyc7XG5cbi8qKlxuICogU2xlZXAgd2l0aGluIGEgd29ya2Zsb3cgZm9yIGEgZ2l2ZW4gZHVyYXRpb24uXG4gKlxuICogVGhpcyBpcyBhIGJ1aWx0LWluIHJ1bnRpbWUgZnVuY3Rpb24gdGhhdCB1c2VzIHRpbWVyIGV2ZW50cyBpbiB0aGUgZXZlbnQgbG9nLlxuICpcbiAqIEBwYXJhbSBkdXJhdGlvbiAtIFRoZSBkdXJhdGlvbiB0byBzbGVlcCBmb3IsIHRoaXMgaXMgYSBzdHJpbmcgaW4gdGhlIGZvcm1hdFxuICogb2YgYFwiMTAwMG1zXCJgLCBgXCIxc1wiYCwgYFwiMW1cImAsIGBcIjFoXCJgLCBvciBgXCIxZFwiYC5cbiAqIEBvdmVybG9hZFxuICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgc2xlZXAgaXMgY29tcGxldGUuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzbGVlcChkdXJhdGlvbjogU3RyaW5nVmFsdWUpOiBQcm9taXNlPHZvaWQ+O1xuXG4vKipcbiAqIFNsZWVwIHdpdGhpbiBhIHdvcmtmbG93IHVudGlsIGEgc3BlY2lmaWMgZGF0ZS5cbiAqXG4gKiBUaGlzIGlzIGEgYnVpbHQtaW4gcnVudGltZSBmdW5jdGlvbiB0aGF0IHVzZXMgdGltZXIgZXZlbnRzIGluIHRoZSBldmVudCBsb2cuXG4gKlxuICogQHBhcmFtIGRhdGUgLSBUaGUgZGF0ZSB0byBzbGVlcCB1bnRpbCwgdGhpcyBtdXN0IGJlIGEgZnV0dXJlIGRhdGUuXG4gKiBAb3ZlcmxvYWRcbiAqIEByZXR1cm5zIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIHNsZWVwIGlzIGNvbXBsZXRlLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2xlZXAoZGF0ZTogRGF0ZSk6IFByb21pc2U8dm9pZD47XG5cbi8qKlxuICogU2xlZXAgd2l0aGluIGEgd29ya2Zsb3cgZm9yIGEgZ2l2ZW4gZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIFRoaXMgaXMgYSBidWlsdC1pbiBydW50aW1lIGZ1bmN0aW9uIHRoYXQgdXNlcyB0aW1lciBldmVudHMgaW4gdGhlIGV2ZW50IGxvZy5cbiAqXG4gKiBAcGFyYW0gZHVyYXRpb25NcyAtIFRoZSBkdXJhdGlvbiB0byBzbGVlcCBmb3IgaW4gbWlsbGlzZWNvbmRzLlxuICogQG92ZXJsb2FkXG4gKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBzbGVlcCBpcyBjb21wbGV0ZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNsZWVwKGR1cmF0aW9uTXM6IG51bWJlcik6IFByb21pc2U8dm9pZD47XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzbGVlcChwYXJhbTogU3RyaW5nVmFsdWUgfCBEYXRlIHwgbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gIC8vIEluc2lkZSB0aGUgd29ya2Zsb3cgVk0sIHRoZSBzbGVlcCBmdW5jdGlvbiBpcyBzdG9yZWQgaW4gdGhlIGdsb2JhbFRoaXMgb2JqZWN0IGJlaGluZCBhIHN5bWJvbFxuICBjb25zdCBzbGVlcEZuID0gKGdsb2JhbFRoaXMgYXMgYW55KVtXT1JLRkxPV19TTEVFUF07XG4gIGlmICghc2xlZXBGbikge1xuICAgIHRocm93IG5ldyBFcnJvcignYHNsZWVwKClgIGNhbiBvbmx5IGJlIGNhbGxlZCBpbnNpZGUgYSB3b3JrZmxvdyBmdW5jdGlvbicpO1xuICB9XG4gIHJldHVybiBzbGVlcEZuKHBhcmFtKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7XG4gIEhvb2ssXG4gIEhvb2tPcHRpb25zLFxuICBSZXF1ZXN0V2l0aFJlc3BvbnNlLFxuICBXZWJob29rLFxuICBXZWJob29rT3B0aW9ucyxcbn0gZnJvbSAnLi4vY3JlYXRlLWhvb2suanMnO1xuaW1wb3J0IHsgV09SS0ZMT1dfQ1JFQVRFX0hPT0sgfSBmcm9tICcuLi9zeW1ib2xzLmpzJztcbmltcG9ydCB7IGdldFdvcmtmbG93TWV0YWRhdGEgfSBmcm9tICcuL2dldC13b3JrZmxvdy1tZXRhZGF0YS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIb29rPFQgPSBhbnk+KG9wdGlvbnM/OiBIb29rT3B0aW9ucyk6IEhvb2s8VD4ge1xuICAvLyBJbnNpZGUgdGhlIHdvcmtmbG93IFZNLCB0aGUgaG9vayBmdW5jdGlvbiBpcyBzdG9yZWQgaW4gdGhlIGdsb2JhbFRoaXMgb2JqZWN0IGJlaGluZCBhIHN5bWJvbFxuICBjb25zdCBjcmVhdGVIb29rRm4gPSAoZ2xvYmFsVGhpcyBhcyBhbnkpW1xuICAgIFdPUktGTE9XX0NSRUFURV9IT09LXG4gIF0gYXMgdHlwZW9mIGNyZWF0ZUhvb2s8VD47XG4gIGlmICghY3JlYXRlSG9va0ZuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ2BjcmVhdGVIb29rKClgIGNhbiBvbmx5IGJlIGNhbGxlZCBpbnNpZGUgYSB3b3JrZmxvdyBmdW5jdGlvbidcbiAgICApO1xuICB9XG4gIHJldHVybiBjcmVhdGVIb29rRm4ob3B0aW9ucyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXZWJob29rKFxuICBvcHRpb25zOiBXZWJob29rT3B0aW9ucyAmIHsgcmVzcG9uZFdpdGg6ICdtYW51YWwnIH1cbik6IFdlYmhvb2s8UmVxdWVzdFdpdGhSZXNwb25zZT47XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV2ViaG9vayhvcHRpb25zPzogV2ViaG9va09wdGlvbnMpOiBXZWJob29rPFJlcXVlc3Q+O1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdlYmhvb2soXG4gIG9wdGlvbnM/OiBXZWJob29rT3B0aW9uc1xuKTogV2ViaG9vazxSZXF1ZXN0PiB8IFdlYmhvb2s8UmVxdWVzdFdpdGhSZXNwb25zZT4ge1xuICBjb25zdCB7IHJlc3BvbmRXaXRoLCB0b2tlbiwgLi4ucmVzdCB9ID0gKG9wdGlvbnMgPz8ge30pIGFzIFdlYmhvb2tPcHRpb25zICYge1xuICAgIHRva2VuPzogc3RyaW5nO1xuICB9O1xuXG4gIGlmICh0b2tlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ2BjcmVhdGVXZWJob29rKClgIGRvZXMgbm90IGFjY2VwdCBhIGB0b2tlbmAgb3B0aW9uLiBXZWJob29rIHRva2VucyBhcmUgYWx3YXlzIHJhbmRvbWx5IGdlbmVyYXRlZC4gVXNlIGBjcmVhdGVIb29rKClgIHdpdGggYHJlc3VtZUhvb2soKWAgZm9yIGRldGVybWluaXN0aWMgdG9rZW4gcGF0dGVybnMuJ1xuICAgICk7XG4gIH1cblxuICBsZXQgbWV0YWRhdGE6IFBpY2s8V2ViaG9va09wdGlvbnMsICdyZXNwb25kV2l0aCc+IHwgdW5kZWZpbmVkO1xuICBpZiAodHlwZW9mIHJlc3BvbmRXaXRoICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1ldGFkYXRhID0geyByZXNwb25kV2l0aCB9O1xuICB9XG5cbiAgY29uc3QgaG9vayA9IGNyZWF0ZUhvb2soeyAuLi5yZXN0LCBtZXRhZGF0YSwgaXNXZWJob29rOiB0cnVlIH0pIGFzXG4gICAgfCBXZWJob29rPFJlcXVlc3Q+XG4gICAgfCBXZWJob29rPFJlcXVlc3RXaXRoUmVzcG9uc2U+O1xuXG4gIGNvbnN0IHsgdXJsIH0gPSBnZXRXb3JrZmxvd01ldGFkYXRhKCk7XG4gIGhvb2sudXJsID0gYCR7dXJsfS8ud2VsbC1rbm93bi93b3JrZmxvdy92MS93ZWJob29rLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGhvb2sudG9rZW4pfWA7XG5cbiAgcmV0dXJuIGhvb2s7XG59XG4iLCAiLyoqXG4gKiBUaGlzIGlzIHRoZSBcInN0YW5kYXJkIGxpYnJhcnlcIiBvZiBzdGVwcyB0aGF0IHdlIG1ha2UgYXZhaWxhYmxlIHRvIGFsbCB3b3JrZmxvdyB1c2Vycy5cbiAqIFRoZSBjYW4gYmUgaW1wb3J0ZWQgbGlrZSBzbzogYGltcG9ydCB7IGZldGNoIH0gZnJvbSAnd29ya2Zsb3cnYC4gYW5kIHVzZWQgaW4gd29ya2Zsb3cuXG4gKiBUaGUgbmVlZCB0byBiZSBleHBvcnRlZCBkaXJlY3RseSBpbiB0aGlzIHBhY2thZ2UgYW5kIGNhbm5vdCBsaXZlIGluIGBjb3JlYCB0byBwcmV2ZW50XG4gKiBjaXJjdWxhciBkZXBlbmRlbmNpZXMgcG9zdC1jb21waWxhdGlvbi5cbiAqL1xuXG4vKipcbiAqIEEgaG9pc3RlZCBgZmV0Y2goKWAgZnVuY3Rpb24gdGhhdCBpcyBleGVjdXRlZCBhcyBhIFwic3RlcFwiIGZ1bmN0aW9uLFxuICogZm9yIHVzZSB3aXRoaW4gd29ya2Zsb3cgZnVuY3Rpb25zLlxuICpcbiAqIEBzZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0ZldGNoX0FQSVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2goLi4uYXJnczogUGFyYW1ldGVyczx0eXBlb2YgZ2xvYmFsVGhpcy5mZXRjaD4pIHtcbiAgJ3VzZSBzdGVwJztcbiAgcmV0dXJuIGdsb2JhbFRoaXMuZmV0Y2goLi4uYXJncyk7XG59XG4iLCAiaW1wb3J0IHsgY3JlYXRlSG9vaywgc2xlZXAgfSBmcm9tIFwid29ya2Zsb3dcIjtcbi8qKl9faW50ZXJuYWxfd29ya2Zsb3dze1wid29ya2Zsb3dzXCI6e1wid29ya2Zsb3dzL3B1cmNoYXNlLWFwcHJvdmFsLnRzXCI6e1wiZGVmYXVsdFwiOntcIndvcmtmbG93SWRcIjpcIndvcmtmbG93Ly8uL3dvcmtmbG93cy9wdXJjaGFzZS1hcHByb3ZhbC8vcHVyY2hhc2VBcHByb3ZhbFwifX19LFwic3RlcHNcIjp7XCJ3b3JrZmxvd3MvcHVyY2hhc2UtYXBwcm92YWwudHNcIjp7XCJub3RpZnlBcHByb3ZlclwiOntcInN0ZXBJZFwiOlwic3RlcC8vLi93b3JrZmxvd3MvcHVyY2hhc2UtYXBwcm92YWwvL25vdGlmeUFwcHJvdmVyXCJ9LFwicmVjb3JkRGVjaXNpb25cIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vd29ya2Zsb3dzL3B1cmNoYXNlLWFwcHJvdmFsLy9yZWNvcmREZWNpc2lvblwifX19fSovO1xuY29uc3Qgbm90aWZ5QXBwcm92ZXIgPSBnbG9iYWxUaGlzW1N5bWJvbC5mb3IoXCJXT1JLRkxPV19VU0VfU1RFUFwiKV0oXCJzdGVwLy8uL3dvcmtmbG93cy9wdXJjaGFzZS1hcHByb3ZhbC8vbm90aWZ5QXBwcm92ZXJcIik7XG5jb25zdCByZWNvcmREZWNpc2lvbiA9IGdsb2JhbFRoaXNbU3ltYm9sLmZvcihcIldPUktGTE9XX1VTRV9TVEVQXCIpXShcInN0ZXAvLy4vd29ya2Zsb3dzL3B1cmNoYXNlLWFwcHJvdmFsLy9yZWNvcmREZWNpc2lvblwiKTtcbmV4cG9ydCBkZWZhdWx0IGFzeW5jIGZ1bmN0aW9uIHB1cmNoYXNlQXBwcm92YWwocG9OdW1iZXIsIGFtb3VudCwgbWFuYWdlcklkLCBkaXJlY3RvcklkKSB7XG4gICAgLy8gU3RlcCAxOiBOb3RpZnkgbWFuYWdlciBhbmQgd2FpdCBmb3IgYXBwcm92YWwgd2l0aCA0OGggdGltZW91dFxuICAgIGF3YWl0IG5vdGlmeUFwcHJvdmVyKHBvTnVtYmVyLCBtYW5hZ2VySWQsIFwiYXBwcm92YWwtcmVxdWVzdFwiKTtcbiAgICBjb25zdCBtYW5hZ2VySG9vayA9IGNyZWF0ZUhvb2soYGFwcHJvdmFsOnBvLSR7cG9OdW1iZXJ9YCk7XG4gICAgY29uc3QgbWFuYWdlclRpbWVvdXQgPSBzbGVlcChcIjQ4aFwiKTtcbiAgICBjb25zdCBtYW5hZ2VyUmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcbiAgICAgICAgbWFuYWdlckhvb2ssXG4gICAgICAgIG1hbmFnZXJUaW1lb3V0XG4gICAgXSk7XG4gICAgaWYgKG1hbmFnZXJSZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBNYW5hZ2VyIHJlc3BvbmRlZFxuICAgICAgICByZXR1cm4gcmVjb3JkRGVjaXNpb24ocG9OdW1iZXIsIG1hbmFnZXJSZXN1bHQuYXBwcm92ZWQgPyBcImFwcHJvdmVkXCIgOiBcInJlamVjdGVkXCIsIG1hbmFnZXJJZCk7XG4gICAgfVxuICAgIC8vIFN0ZXAgMjogTWFuYWdlciB0aW1lZCBvdXQgXHUyMDE0IGVzY2FsYXRlIHRvIGRpcmVjdG9yIHdpdGggMjRoIHRpbWVvdXRcbiAgICBhd2FpdCBub3RpZnlBcHByb3Zlcihwb051bWJlciwgZGlyZWN0b3JJZCwgXCJlc2NhbGF0aW9uLXJlcXVlc3RcIik7XG4gICAgY29uc3QgZGlyZWN0b3JIb29rID0gY3JlYXRlSG9vayhgZXNjYWxhdGlvbjpwby0ke3BvTnVtYmVyfWApO1xuICAgIGNvbnN0IGRpcmVjdG9yVGltZW91dCA9IHNsZWVwKFwiMjRoXCIpO1xuICAgIGNvbnN0IGRpcmVjdG9yUmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcbiAgICAgICAgZGlyZWN0b3JIb29rLFxuICAgICAgICBkaXJlY3RvclRpbWVvdXRcbiAgICBdKTtcbiAgICBpZiAoZGlyZWN0b3JSZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBEaXJlY3RvciByZXNwb25kZWRcbiAgICAgICAgcmV0dXJuIHJlY29yZERlY2lzaW9uKHBvTnVtYmVyLCBkaXJlY3RvclJlc3VsdC5hcHByb3ZlZCA/IFwiYXBwcm92ZWRcIiA6IFwicmVqZWN0ZWRcIiwgZGlyZWN0b3JJZCk7XG4gICAgfVxuICAgIC8vIFN0ZXAgMzogRnVsbCB0aW1lb3V0IFx1MjAxNCBhdXRvLXJlamVjdFxuICAgIGF3YWl0IG5vdGlmeUFwcHJvdmVyKHBvTnVtYmVyLCBtYW5hZ2VySWQsIFwiYXV0by1yZWplY3Rpb24tbm90aWNlXCIpO1xuICAgIHJldHVybiByZWNvcmREZWNpc2lvbihwb051bWJlciwgXCJhdXRvLXJlamVjdGVkXCIsIFwic3lzdGVtXCIpO1xufVxucHVyY2hhc2VBcHByb3ZhbC53b3JrZmxvd0lkID0gXCJ3b3JrZmxvdy8vLi93b3JrZmxvd3MvcHVyY2hhc2UtYXBwcm92YWwvL3B1cmNoYXNlQXBwcm92YWxcIjtcbmdsb2JhbFRoaXMuX19wcml2YXRlX3dvcmtmbG93cy5zZXQoXCJ3b3JrZmxvdy8vLi93b3JrZmxvd3MvcHVyY2hhc2UtYXBwcm92YWwvL3B1cmNoYXNlQXBwcm92YWxcIiwgcHVyY2hhc2VBcHByb3ZhbCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUEsOEVBQUFBLFNBQUE7QUFFSSxRQUFJLElBQUk7QUFDWixRQUFJLElBQUksSUFBSTtBQUNaLFFBQUksSUFBSSxJQUFJO0FBQ1osUUFBSSxJQUFJLElBQUk7QUFDWixRQUFJLElBQUksSUFBSTtBQUNaLFFBQUksSUFBSSxJQUFJO0FBYVIsSUFBQUEsUUFBTyxVQUFVLFNBQVMsS0FBSyxTQUFTO0FBQ3hDLGdCQUFVLFdBQVcsQ0FBQztBQUN0QixVQUFJLE9BQU8sT0FBTztBQUNsQixVQUFJLFNBQVMsWUFBWSxJQUFJLFNBQVMsR0FBRztBQUNyQyxlQUFPLE1BQU0sR0FBRztBQUFBLE1BQ3BCLFdBQVcsU0FBUyxZQUFZLFNBQVMsR0FBRyxHQUFHO0FBQzNDLGVBQU8sUUFBUSxPQUFPLFFBQVEsR0FBRyxJQUFJLFNBQVMsR0FBRztBQUFBLE1BQ3JEO0FBQ0EsWUFBTSxJQUFJLE1BQU0sMERBQTBELEtBQUssVUFBVSxHQUFHLENB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LHVCQUFPLElBQUksZ0JBQWdCOzs7QUNtQ3pELGVBQXNCLE1BQU0sT0FBa0M7QUFFNUQsUUFBTSxVQUFXLFdBQW1CLGNBQWM7QUFDbEQsTUFBSSxDQUFDLFNBQVM7QUFDWixVQUFNLElBQUksTUFBTSx5REFBeUQ7RUFDM0U7QUFDQSxTQUFPLFFBQVEsS0FBSztBQUN0QjtBQVBzQjs7O0FDM0JoQixTQUFVLFdBQW9CLFNBQXFCO0FBRXZELFFBQU0sZUFBZ0IsV0FDcEIsb0JBQW9CO0FBRXRCLE1BQUksQ0FBQyxjQUFjO0FBQ2pCLFVBQU0sSUFBSSxNQUNSLDhEQUE4RDtFQUVsRTtBQUNBLFNBQU8sYUFBYSxPQUFPO0FBQzdCO0FBWGdCOzs7QUNFYixJQUFBLFFBQUEsV0FBQSx1QkFBQSxJQUFBLG1CQUFBLENBQUEsRUFBQSw4Q0FBQTs7O0FDVkgsSUFBTSxpQkFBaUIsV0FBVyx1QkFBTyxJQUFJLG1CQUFtQixDQUFDLEVBQUUscURBQXFEO0FBQ3hILElBQU0saUJBQWlCLFdBQVcsdUJBQU8sSUFBSSxtQkFBbUIsQ0FBQyxFQUFFLHFEQUFxRDtBQUN4SCxlQUFPLGlCQUF3QyxVQUFVLFFBQVEsV0FBVyxZQUFZO0FBRXBGLFFBQU0sZUFBZSxVQUFVLFdBQVcsa0JBQWtCO0FBQzVELFFBQU0sY0FBYyxXQUFXLGVBQWUsUUFBUSxFQUFFO0FBQ3hELFFBQU0saUJBQWlCLE1BQU0sS0FBSztBQUNsQyxRQUFNLGdCQUFnQixNQUFNLFFBQVEsS0FBSztBQUFBLElBQ3JDO0FBQUEsSUFDQTtBQUFBLEVBQ0osQ0FBQztBQUNELE1BQUksa0JBQWtCLFFBQVc7QUFFN0IsV0FBTyxlQUFlLFVBQVUsY0FBYyxXQUFXLGFBQWEsWUFBWSxTQUFTO0FBQUEsRUFDL0Y7QUFFQSxRQUFNLGVBQWUsVUFBVSxZQUFZLG9CQUFvQjtBQUMvRCxRQUFNLGVBQWUsV0FBVyxpQkFBaUIsUUFBUSxFQUFFO0FBQzNELFFBQU0sa0JBQWtCLE1BQU0sS0FBSztBQUNuQyxRQUFNLGlCQUFpQixNQUFNLFFBQVEsS0FBSztBQUFBLElBQ3RDO0FBQUEsSUFDQTtBQUFBLEVBQ0osQ0FBQztBQUNELE1BQUksbUJBQW1CLFFBQVc7QUFFOUIsV0FBTyxlQUFlLFVBQVUsZUFBZSxXQUFXLGFBQWEsWUFBWSxVQUFVO0FBQUEsRUFDakc7QUFFQSxRQUFNLGVBQWUsVUFBVSxXQUFXLHVCQUF1QjtBQUNqRSxTQUFPLGVBQWUsVUFBVSxpQkFBaUIsUUFBUTtBQUM3RDtBQTVCOEI7QUE2QjlCLGlCQUFpQixhQUFhO0FBQzlCLFdBQVcsb0JBQW9CLElBQUksNkRBQTZELGdCQUFnQjsiLAogICJuYW1lcyI6IFsibW9kdWxlIiwgIm1zIl0KfQo=
`;

export const POST = workflowEntrypoint(workflowCode);
