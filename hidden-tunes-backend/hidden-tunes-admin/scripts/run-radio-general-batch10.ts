process.env.RADIO_EXPANSION_BATCH = "radio-general-batch10";

void (async () => {
  await import("./run-radio-general-batch3");
})();
