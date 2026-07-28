process.env.RADIO_EXPANSION_BATCH = "radio-general-batch17";

void (async () => {
  await import("./run-radio-general-batch3");
})();
