process.env.RADIO_EXPANSION_BATCH = "radio-general-batch14";

void (async () => {
  await import("./run-radio-general-batch3");
})();
