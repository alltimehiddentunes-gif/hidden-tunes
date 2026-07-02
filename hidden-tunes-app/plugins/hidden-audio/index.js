"use strict";

const fs = require("fs");
const path = require("path");
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("@expo/config-plugins");

const HIDDEN_AUDIO_GROUP = "HiddenAudioModule";

const NATIVE_FILES = ["HiddenAudioModule.swift", "HiddenAudioModule.m"];

function getRepoSourceDir(projectRoot) {
  return path.join(projectRoot, "plugins", "hidden-audio", "ios");
}

const withHiddenAudioNativeSources = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const { projectRoot, platformProjectRoot } = config.modRequest;
      const appName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const sourceDir = getRepoSourceDir(projectRoot);

      const destinationDir = path.join(
        platformProjectRoot,
        appName,
        HIDDEN_AUDIO_GROUP
      );

      fs.mkdirSync(destinationDir, { recursive: true });

      for (const fileName of NATIVE_FILES) {
        fs.copyFileSync(
          path.join(sourceDir, fileName),
          path.join(destinationDir, fileName)
        );
      }

      return config;
    },
  ]);
};

const withHiddenAudioXcodeProject = (config) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const appName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const targetUuid = xcodeProject.getFirstTarget().uuid;
    const groupPath = `${appName}/${HIDDEN_AUDIO_GROUP}`;

    for (const fileName of NATIVE_FILES) {
      const filePath = `${groupPath}/${fileName}`;

      if (xcodeProject.hasFile(filePath)) {
        continue;
      }

      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: filePath,
        groupName: HIDDEN_AUDIO_GROUP,
        project: xcodeProject,
        verbose: true,
        targetUuid,
      });
    }

    return config;
  });
};

const withHiddenAudio = (config) => {
  config = withHiddenAudioNativeSources(config);
  config = withHiddenAudioXcodeProject(config);
  return config;
};

module.exports = withHiddenAudio;
