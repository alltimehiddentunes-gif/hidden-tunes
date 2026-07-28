process.env.RADIO_EXPANSION_BATCH = "radio-general-batch5";

void (async () => {
  await import("./run-radio-general-batch3");
})();
