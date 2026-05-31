"use strict";

const fs = require("fs");
const path = require("path");
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("@expo/config-plugins");

const HIDDEN_AUDIO_GROUP = "HiddenAudio";

const NATIVE_FILES = [
  "HiddenAudioEngine.swift",
  "HiddenAudioModule.swift",
  "HiddenAudioModule.m",
];

function getRepoSourceDir(projectRoot) {
  return path.join(projectRoot, "ios", HIDDEN_AUDIO_GROUP);
}

const withHiddenAudioNativeSources = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const { projectRoot, platformProjectRoot } = config.modRequest;
      const sourceDir = getRepoSourceDir(projectRoot);
      const destinationDir = path.join(platformProjectRoot, HIDDEN_AUDIO_GROUP);

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
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const targetUuid = xcodeProject.getFirstTarget().uuid;

    let groupKey = xcodeProject.findPBXGroupKey({ name: HIDDEN_AUDIO_GROUP });
    if (!groupKey) {
      groupKey = xcodeProject.pbxCreateGroup(
        HIDDEN_AUDIO_GROUP,
        HIDDEN_AUDIO_GROUP
      );
      const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;
      xcodeProject.addToPbxGroup(groupKey, mainGroup);
    }

    for (const fileName of NATIVE_FILES) {
      const filePath = path.join(projectName, HIDDEN_AUDIO_GROUP, fileName);

      if (!xcodeProject.hasFile(filePath)) {
        xcodeProject.addSourceFile(filePath, { target: targetUuid }, groupKey);
      }
    }

    return config;
  });
};

/**
 * Phase 2: inject isolated HiddenAudio native module sources at prebuild.
 * Does not modify Info.plist, entitlements, or existing plugins.
 */
const withHiddenAudio = (config) => {
  config = withHiddenAudioNativeSources(config);
  config = withHiddenAudioXcodeProject(config);

  console.log(
    "[hidden-audio] Phase 2: HiddenAudio Swift/ObjC sources will be copied and linked during iOS prebuild."
  );

  return config;
};

module.exports = withHiddenAudio;
