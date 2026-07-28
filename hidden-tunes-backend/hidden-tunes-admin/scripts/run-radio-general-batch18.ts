process.env.RADIO_EXPANSION_BATCH = "radio-general-batch18";

void (async () => {
  await import("./run-radio-general-batch3");
})();
