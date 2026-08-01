const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const ini = require("ini");
const {
  loadServers,
  saveServers,
  isAuthenticated,
  isAdmin,
} = require("../utils/helpers");

const normalizeIniKey = (key) =>
  String(key).toLowerCase().replace(/\\\./g, ".").replace(/\[\]$/g, "");

const findSectionKey = (config, desired) =>
  Object.keys(config).find(
    (key) => normalizeIniKey(key) === normalizeIniKey(desired),
  );

const getSection = (config, desired) => {
  const key = findSectionKey(config, desired);
  return key ? config[key] : undefined;
};

const setSection = (config, desired, value) => {
  const key = findSectionKey(config, desired);
  if (key && key !== desired) delete config[key];
  config[desired] = value;
};

const deleteSection = (config, desired) => {
  const key = findSectionKey(config, desired);
  if (key) delete config[key];
};

const normalizeIniSections = (config) => {
  const normalized = { ...config };

  const tryMoveNestedSection = (sourceSection, nestedKey) => {
    const section = normalized[sourceSection];
    if (!section || typeof section !== "object" || Array.isArray(section))
      return;
    const nestedSection = section[nestedKey];
    if (
      nestedSection &&
      typeof nestedSection === "object" &&
      !Array.isArray(nestedSection)
    ) {
      const targetSection = `${sourceSection}.${nestedKey}`;
      normalized[targetSection] = normalized[targetSection] || nestedSection;
      delete section[nestedKey];
      if (Object.keys(section).length === 0) delete normalized[sourceSection];
    }
  };

  const tryMoveDottedKeys = (sourceSection, nestedKey) => {
    const section = normalized[sourceSection];
    if (!section || typeof section !== "object" || Array.isArray(section))
      return;

    const targetSection = `${sourceSection}.${nestedKey}`;
    for (const key of Object.keys(section)) {
      const prefix = `${nestedKey}.`;
      if (key.startsWith(prefix)) {
        const nestedKeyName = key.slice(prefix.length);
        normalized[targetSection] = normalized[targetSection] || {};
        normalized[targetSection][nestedKeyName] = section[key];
        delete section[key];
      }
    }

    if (Object.keys(section).length === 0) delete normalized[sourceSection];
  };

  tryMoveNestedSection("/Script/ShooterGame", "ShooterGameUserSettings");
  tryMoveNestedSection("/Script/Engine", "GameSession");
  tryMoveDottedKeys("/Script/ShooterGame", "ShooterGameUserSettings");
  tryMoveDottedKeys("/Script/Engine", "GameSession");

  return normalized;
};

const formatIniValue = (value) => {
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return "";
    }
  }
  return String(value);
};

const appendIniEntries = (lines, keyPrefix, value) => {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      appendIniEntries(lines, keyPrefix, item);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [subKey, subValue] of Object.entries(value)) {
      appendIniEntries(lines, `${keyPrefix}.${subKey}`, subValue);
    }
    return;
  }

  lines.push(`${keyPrefix}=${formatIniValue(value)}`);
};

const serializeIniConfig = (config) => {
  const sections = Object.entries(config).map(([sectionName, sectionValue]) => {
    const normalizedSectionName = String(sectionName).replace(/\\\./g, ".");
    const lines = [`[${normalizedSectionName}]`];

    if (sectionValue && typeof sectionValue === "object") {
      for (const [key, value] of Object.entries(sectionValue)) {
        appendIniEntries(lines, key, value);
      }
    }

    return lines.join("\n");
  });

  return sections.join("\n\n") + "\n";
};

router.get("/settings/:serverId", isAuthenticated, (req, res) => {
  const servers = loadServers();
  const server = servers.find((s) => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const configDir = path.join(
    server.path,
    "ShooterGame/Saved/Config/LinuxServer",
  );
  const gusPath = path.join(configDir, "GameUserSettings.ini");
  const gamePath = path.join(configDir, "Game.ini");

  let gusConfig = {};
  let gameConfig = {};

  const findSectionKey = (config, desired) =>
    Object.keys(config).find(
      (key) => key.toLowerCase() === desired.toLowerCase(),
    );

  const getSection = (config, desired) => {
    const key = findSectionKey(config, desired);
    return key ? config[key] : undefined;
  };

  const setSection = (config, desired, value) => {
    const key = findSectionKey(config, desired);
    if (key && key !== desired) delete config[key];
    config[desired] = value;
  };

  try {
    if (fs.existsSync(gusPath))
      gusConfig = normalizeIniSections(
        ini.parse(fs.readFileSync(gusPath, "utf-8")),
      );
    if (fs.existsSync(gamePath))
      gameConfig = normalizeIniSections(
        ini.parse(fs.readFileSync(gamePath, "utf-8")),
      );
  } catch (e) {}

  const ss = getSection(gusConfig, "ServerSettings") || {};
  const gmSectionName =
    findSectionKey(gameConfig, "/Script/ShooterGame.ShooterGameMode") ||
    "/Script/ShooterGame.ShooterGameMode";
  const gm =
    getSection(gameConfig, "/Script/ShooterGame.ShooterGameMode") || {};
  const gs = getSection(gusConfig, "/Script/Engine.GameSession") || {};
  const session = getSection(gusConfig, "SessionSettings") || {};
  const motd = getSection(gusConfig, "MessageOfTheDay") || {};
  const modInstaller =
    getSection(gameConfig, "ModInstaller") ||
    getSection(gusConfig, "ModInstaller") ||
    {};

  let modIdsArray = [];
  if (modInstaller.ModIDS) {
    modIdsArray = Array.isArray(modInstaller.ModIDS)
      ? modInstaller.ModIDS
      : [modInstaller.ModIDS];
  } else if (ss.ActiveMods) {
    modIdsArray = ss.ActiveMods.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  const modIdsStr = modIdsArray.join(", ");
  const isTrue = (val) => val === "True" || val === true;

  let npcReplacements = [];
  if (gm.NPCReplacements) {
    const rawArr = Array.isArray(gm.NPCReplacements)
      ? gm.NPCReplacements
      : [gm.NPCReplacements];
    rawArr.forEach((entry) => {
      const match = entry.match(
        /FromClassName="([^"]+)",ToClassName="([^"]*)"/,
      );
      if (match) {
        npcReplacements.push({ from: match[1], to: match[2] });
      } else {
        const parts = entry.split(",");
        if (parts.length >= 2)
          npcReplacements.push({ from: parts[0].trim(), to: parts[1].trim() });
        else if (parts.length === 1)
          npcReplacements.push({ from: parts[0].trim(), to: "" });
      }
    });
  }

  let engramEntries = [];
  if (gm.OverrideNamedEngramEntries) {
    const rawArr = Array.isArray(gm.OverrideNamedEngramEntries)
      ? gm.OverrideNamedEngramEntries
      : [gm.OverrideNamedEngramEntries];
    rawArr.forEach((entry) => {
      const classNameMatch = entry.match(/EngramClassName="([^"]+)"/);
      const levelMatch = entry.match(/EngramLevelRequirement=(\d+)/);
      const pointsMatch = entry.match(/EngramPointsCost=(\d+)/);
      const hiddenMatch =
        entry.match(/EngramHidden=(True|False)/i) ||
        entry.match(/bHideInEngramViewer=(True|False)/i);
      const preReqMatch =
        entry.match(/RemoveEngramPreReq=(True|False)/i) ||
        entry.match(/bRemoveEngramPrerequisite=(True|False)/i);
      if (classNameMatch) {
        engramEntries.push({
          className: classNameMatch[1],
          level: levelMatch ? parseInt(levelMatch[1], 10) : 1,
          points: pointsMatch ? parseInt(pointsMatch[1], 10) : 1,
          hidden: hiddenMatch ? isTrue(hiddenMatch[1]) : false,
          removePreReq: preReqMatch ? isTrue(preReqMatch[1]) : false,
        });
      }
    });
  }

  let craftingCosts = [];
  if (gm.ConfigOverrideItemCraftingCosts) {
    const rawArr = Array.isArray(gm.ConfigOverrideItemCraftingCosts)
      ? gm.ConfigOverrideItemCraftingCosts
      : [gm.ConfigOverrideItemCraftingCosts];
    const costMap = {};
    rawArr.forEach((entry) => {
      const itemClassMatch = entry.match(/ItemClassString="([^"]+)"/);
      if (itemClassMatch) {
        const itemClass = itemClassMatch[1];
        if (!costMap[itemClass]) costMap[itemClass] = [];
        const resRegex =
          /ResourceItemTypeString="([^"]+)",(?:BaseResourceRequirement|ResourceQuantity)=([\d.]+)/g;
        let resMatch;
        while ((resMatch = resRegex.exec(entry)) !== null) {
          costMap[itemClass].push({
            type: resMatch[1],
            amount: parseFloat(resMatch[2]),
          });
        }
      }
    });
    for (const [itemClass, resources] of Object.entries(costMap)) {
      craftingCosts.push({ itemClass, resources });
    }
  }

  const getVal = (sources, key, defaultVal) => {
    const lowerKey = key.toLowerCase();
    for (const source of sources) {
      if (!source) continue;
      const foundKey = Object.keys(source).find(
        (k) => k.toLowerCase() === lowerKey,
      );
      if (
        foundKey !== undefined &&
        source[foundKey] !== undefined &&
        source[foundKey] !== ""
      ) {
        return source[foundKey];
      }
    }
    return defaultVal;
  };

  res.json({
    serverMap: getVal([ss], "ActiveMap", "TheIsland"),
    sessionName: getVal([session, ss, gusConfig], "SessionName", ""),
    serverPassword: getVal([ss], "ServerPassword", ""),
    serverAdminPassword: getVal([ss], "ServerAdminPassword", ""),
    maxPlayers: getVal([gs, ss], "MaxPlayers", 70),
    difficultyOffset: getVal([ss], "DifficultyOffset", 1.0),
    overrideOfficialDifficulty: getVal([ss], "OverrideOfficialDifficulty", 1.0),
    maxTamedDinos: getVal([ss], "MaxTamedDinos", 5000),
    itemStackSizeMultiplier: getVal([ss], "ItemStackSizeMultiplier", 1.0),
    autoSavePeriodMinutes: getVal([ss], "AutoSavePeriodMinutes", 15.0),
    motdMessage: getVal([motd], "Message", ""),
    motdDuration: getVal([motd], "Duration", 5),
    serverPVE: isTrue(getVal([ss], "ServerPVE")),
    serverHardcore: isTrue(getVal([ss], "ServerHardcore")),
    noTributeDownloads: isTrue(getVal([ss], "NoTributeDownloads")),
    allowFlyerCarryPvE: isTrue(getVal([ss], "AllowFlyerCarryPvE")),
    globalVoiceChat: isTrue(getVal([ss], "GlobalVoiceChat")),
    proximityChat: isTrue(getVal([ss], "ProximityChat")),
    allowThirdPersonPlayer: isTrue(getVal([ss], "AllowThirdPersonPlayer")),
    showMapPlayerLocation: isTrue(getVal([ss], "ShowMapPlayerLocation")),
    enablePvPGamma: isTrue(getVal([ss], "EnablePvPGamma")),
    disableStructurePlacementCollision: isTrue(
      getVal([ss, gm], "DisableStructurePlacementCollision") ||
        getVal([ss, gm], "bDisableStructurePlacementCollision"),
    ),
    rconEnabled: isTrue(getVal([ss], "RCONEnabled")),
    rconPort: getVal([ss], "RCONPort", 27020),
    serverCrosshair: isTrue(getVal([ss], "ServerCrosshair")),
    serverForceNoHUD: isTrue(getVal([ss], "ServerForceNoHUD")),
    allowHitMarkers: isTrue(getVal([ss], "AllowHitMarkers")),
    bDisableFriendlyFire: isTrue(getVal([gm, ss], "bDisableFriendlyFire")),
    bAllowUnlimitedRespecs: isTrue(getVal([gm, ss], "bAllowUnlimitedRespecs")),
    bUseCorpseLocator: isTrue(getVal([gm, ss], "bUseCorpseLocator")),
    allowAnyoneBabyImprintCuddle: isTrue(
      getVal([ss], "AllowAnyoneBabyImprintCuddle"),
    ),
    overrideStructurePlatformPrevention: isTrue(
      getVal([ss], "OverrideStructurePlatformPrevention"),
    ),
    mods: modIdsStr,
    tamingSpeedMultiplier: getVal([ss, gm], "TamingSpeedMultiplier", 1.0),
    harvestAmountMultiplier: getVal([ss, gm], "HarvestAmountMultiplier", 1.0),
    harvestHealthMultiplier: getVal([ss, gm], "HarvestHealthMultiplier", 1.0),
    genericXPMultiplier: getVal([ss, gm], "GenericXPMultiplier", 1.0),
    craftXPMultiplier: getVal([ss, gm], "CraftXPMultiplier", 1.0),
    harvestXPMultiplier: getVal([ss, gm], "HarvestXPMultiplier", 1.0),
    killXPMultiplier: getVal([ss, gm], "KillXPMultiplier", 1.0),
    specialXPMultiplier: getVal([ss, gm], "SpecialXPMultiplier", 1.0),
    craftingSkillBonusMultiplier: getVal(
      [ss, gm],
      "CraftingSkillBonusMultiplier",
      1.0,
    ),
    layEggIntervalMultiplier: getVal([ss, gm], "LayEggIntervalMultiplier", 1.0),
    matingIntervalMultiplier: getVal([ss, gm], "MatingIntervalMultiplier", 1.0),
    eggHatchSpeedMultiplier: getVal([ss, gm], "EggHatchSpeedMultiplier", 1.0),
    babyMatureSpeedMultiplier: getVal(
      [ss, gm],
      "BabyMatureSpeedMultiplier",
      1.0,
    ),
    babyFoodConsumptionSpeedMultiplier: getVal(
      [ss, gm],
      "BabyFoodConsumptionSpeedMultiplier",
      1.0,
    ),
    babyCuddleIntervalMultiplier: getVal(
      [ss, gm],
      "BabyCuddleIntervalMultiplier",
      1.0,
    ),
    nightTimeSpeedScale: getVal([ss, gm], "NightTimeSpeedScale", 1.0),
    dayTimeSpeedScale: getVal([ss, gm], "DayTimeSpeedScale", 1.0),
    resourcesRespawnPeriodMultiplier: getVal(
      [ss, gm],
      "ResourcesRespawnPeriodMultiplier",
      1.0,
    ),
    playerDamageMultiplier: getVal([ss, gm], "PlayerDamageMultiplier", 1.0),
    dinoDamageMultiplier: getVal([ss, gm], "DinoDamageMultiplier", 1.0),
    tamedDinoDamageMultiplier: getVal(
      [ss, gm],
      "TamedDinoDamageMultiplier",
      1.0,
    ),
    dinoResistanceMultiplier: getVal([ss, gm], "DinoResistanceMultiplier", 1.0),
    tamedDinoResistanceMultiplier: getVal(
      [ss, gm],
      "TamedDinoResistanceMultiplier",
      1.0,
    ),
    structureDamageMultiplier: getVal(
      [ss, gm],
      "StructureDamageMultiplier",
      1.0,
    ),
    structureResistanceMultiplier: getVal(
      [ss, gm],
      "StructureResistanceMultiplier",
      1.0,
    ),
    playerHarvestingDamageMultiplier: getVal(
      [ss, gm],
      "PlayerHarvestingDamageMultiplier",
      1.0,
    ),
    dinoHarvestingDamageMultiplier: getVal(
      [ss, gm],
      "DinoHarvestingDamageMultiplier",
      1.0,
    ),
    wildDinoCharacterFoodDrainMultiplier: getVal(
      [ss, gm],
      "WildDinoCharacterFoodDrainMultiplier",
      1.0,
    ),
    globalSpoilingTimeMultiplier: getVal(
      [ss, gm],
      "GlobalSpoilingTimeMultiplier",
      1.0,
    ),
    cropGrowthSpeedMultiplier: getVal(
      [ss, gm],
      "CropGrowthSpeedMultiplier",
      1.0,
    ),
    cropDecaySpeedMultiplier: getVal([ss, gm], "CropDecaySpeedMultiplier", 1.0),
    supplyCrateLootQualityMultiplier: getVal(
      [ss, gm],
      "SupplyCrateLootQualityMultiplier",
      1.0,
    ),
    fishingLootQualityMultiplier: getVal(
      [ss, gm],
      "FishingLootQualityMultiplier",
      1.0,
    ),
    maxTribeLogs: getVal([ss, gm], "MaxTribeLogs", ""),
    useCorpseLifeSpanMultiplier: getVal(
      [ss, gm],
      "UseCorpseLifeSpanMultiplier",
      "",
    ),
    globalPoweredBatteryDurabilityDecreasePerSecond: getVal(
      [ss, gm],
      "GlobalPoweredBatteryDurabilityDecreasePerSecond",
      "",
    ),
    resourceNoReplenishRadiusPlayers: getVal(
      [ss, gm],
      "ResourceNoReplenishRadiusPlayers",
      0,
    ),
    resourceNoReplenishRadiusStructures: getVal(
      [ss, gm],
      "ResourceNoReplenishRadiusStructures",
      0,
    ),
    globalItemDecompositionTimeMultiplier: getVal(
      [ss, gm],
      "GlobalItemDecompositionTimeMultiplier",
      1.0,
    ),
    globalCorpseDecompositionTimeMultiplier: getVal(
      [ss, gm],
      "GlobalCorpseDecompositionTimeMultiplier",
      1.0,
    ),
    overrideMaxExperiencePointsPlayer: getVal(
      [gm, ss],
      "OverrideMaxExperiencePointsPlayer",
      "",
    ),
    overrideMaxExperiencePointsDino: getVal(
      [gm, ss],
      "OverrideMaxExperiencePointsDino",
      "",
    ),
    tamedDinoCharacterFoodDrainMultiplier: getVal(
      [ss, gm],
      "TamedDinoCharacterFoodDrainMultiplier",
      1.0,
    ),
    tamedDinoTorporDrainMultiplier: getVal(
      [ss, gm],
      "TamedDinoTorporDrainMultiplier",
      1.0,
    ),
    wildDinoTorporDrainMultiplier: getVal(
      [ss, gm],
      "WildDinoTorporDrainMultiplier",
      1.0,
    ),
    passiveTameIntervalMultiplier: getVal(
      [ss, gm],
      "PassiveTameIntervalMultiplier",
      1.0,
    ),
    baseTemperatureMultiplier: getVal(
      [ss, gm],
      "BaseTemperatureMultiplier",
      1.0,
    ),
    npcReplacements,
    engramEntries,
    craftingCosts,
  });
});

router.post("/settings/:serverId", isAuthenticated, isAdmin, (req, res) => {
  const servers = loadServers();
  const serverIndex = servers.findIndex((s) => s.id === req.params.serverId);
  if (serverIndex === -1)
    return res.status(404).json({ error: "Server not found" });
  const server = servers[serverIndex];

  const configDir = path.join(
    server.path,
    "ShooterGame/Saved/Config/LinuxServer",
  );
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  const gusPath = path.join(configDir, "GameUserSettings.ini");
  const gamePath = path.join(configDir, "Game.ini");

  let gusConfig = {};
  let gameConfig = {};

  try {
    if (fs.existsSync(gusPath))
      gusConfig = normalizeIniSections(
        ini.parse(fs.readFileSync(gusPath, "utf-8")),
      );
    if (fs.existsSync(gamePath))
      gameConfig = normalizeIniSections(
        ini.parse(fs.readFileSync(gamePath, "utf-8")),
      );
  } catch (e) {}

  const gmSectionName =
    findSectionKey(gameConfig, "/Script/ShooterGame.ShooterGameMode") ||
    findSectionKey(gameConfig, "/script/shootergame.shootergamemode") ||
    "/Script/ShooterGame.ShooterGameMode";

  const ss = getSection(gusConfig, "ServerSettings") || {};
  const gs = getSection(gusConfig, "/Script/Engine.GameSession") || {};
  const session = getSection(gusConfig, "SessionSettings") || {};
  const motd = getSection(gusConfig, "MessageOfTheDay") || {};
  const gm = getSection(gameConfig, gmSectionName) || {};

  setSection(gusConfig, "ServerSettings", ss);
  setSection(gusConfig, "/Script/Engine.GameSession", gs);
  setSection(gusConfig, "SessionSettings", session);
  setSection(gusConfig, "MessageOfTheDay", motd);
  setSection(gameConfig, gmSectionName, gm);

  const body = req.body;

  if (body.sessionName !== undefined && body.sessionName.trim() !== "") {
    ss.SessionName = body.sessionName;
    session.SessionName = body.sessionName;
    server.name = body.sessionName;
    saveServers(servers);
  }

  if (body.serverMap !== undefined) ss.ActiveMap = body.serverMap;
  if (body.serverPassword !== undefined)
    ss.ServerPassword = body.serverPassword;
  if (body.serverAdminPassword !== undefined)
    ss.ServerAdminPassword = body.serverAdminPassword;
  if (body.maxPlayers !== undefined) {
    ss.MaxPlayers = body.maxPlayers;
    gs.MaxPlayers = body.maxPlayers;
  }
  if (body.rconPort !== undefined) ss.RCONPort = body.rconPort;
  if (body.difficultyOffset !== undefined)
    ss.DifficultyOffset = body.difficultyOffset;
  if (body.overrideOfficialDifficulty !== undefined)
    ss.OverrideOfficialDifficulty = body.overrideOfficialDifficulty;
  if (body.maxTamedDinos !== undefined) ss.MaxTamedDinos = body.maxTamedDinos;
  if (body.itemStackSizeMultiplier !== undefined)
    ss.ItemStackSizeMultiplier = body.itemStackSizeMultiplier;
  if (body.autoSavePeriodMinutes !== undefined)
    ss.AutoSavePeriodMinutes = body.autoSavePeriodMinutes;
  if (body.motdMessage !== undefined) motd.Message = body.motdMessage;
  if (body.motdDuration !== undefined) motd.Duration = body.motdDuration;

  const gusMultipliers = {
    tamingSpeedMultiplier: "TamingSpeedMultiplier",
    harvestAmountMultiplier: "HarvestAmountMultiplier",
    harvestHealthMultiplier: "HarvestHealthMultiplier",
    nightTimeSpeedScale: "NightTimeSpeedScale",
    dayTimeSpeedScale: "DayTimeSpeedScale",
    resourcesRespawnPeriodMultiplier: "ResourcesRespawnPeriodMultiplier",
    playerDamageMultiplier: "PlayerDamageMultiplier",
    dinoDamageMultiplier: "DinoDamageMultiplier",
    tamedDinoDamageMultiplier: "TamedDinoDamageMultiplier",
    dinoResistanceMultiplier: "DinoResistanceMultiplier",
    tamedDinoResistanceMultiplier: "TamedDinoResistanceMultiplier",
    structureDamageMultiplier: "StructureDamageMultiplier",
    structureResistanceMultiplier: "StructureResistanceMultiplier",
    playerHarvestingDamageMultiplier: "PlayerHarvestingDamageMultiplier",
    dinoHarvestingDamageMultiplier: "DinoHarvestingDamageMultiplier",
    globalSpoilingTimeMultiplier: "GlobalSpoilingTimeMultiplier",
    cropGrowthSpeedMultiplier: "CropGrowthSpeedMultiplier",
    cropDecaySpeedMultiplier: "CropDecaySpeedMultiplier",
    supplyCrateLootQualityMultiplier: "SupplyCrateLootQualityMultiplier",
    fishingLootQualityMultiplier: "FishingLootQualityMultiplier",
    maxTribeLogs: "MaxTribeLogs",
    useCorpseLifeSpanMultiplier: "UseCorpseLifeSpanMultiplier",
    globalPoweredBatteryDurabilityDecreasePerSecond:
      "GlobalPoweredBatteryDurabilityDecreasePerSecond",
    resourceNoReplenishRadiusPlayers: "ResourceNoReplenishRadiusPlayers",
    resourceNoReplenishRadiusStructures: "ResourceNoReplenishRadiusStructures",
    globalItemDecompositionTimeMultiplier:
      "GlobalItemDecompositionTimeMultiplier",
    globalCorpseDecompositionTimeMultiplier:
      "GlobalCorpseDecompositionTimeMultiplier",
  };

  const gameMultipliers = {
    genericXPMultiplier: "GenericXPMultiplier",
    craftXPMultiplier: "CraftXPMultiplier",
    harvestXPMultiplier: "HarvestXPMultiplier",
    killXPMultiplier: "KillXPMultiplier",
    specialXPMultiplier: "SpecialXPMultiplier",
    craftingSkillBonusMultiplier: "CraftingSkillBonusMultiplier",
    layEggIntervalMultiplier: "LayEggIntervalMultiplier",
    matingIntervalMultiplier: "MatingIntervalMultiplier",
    eggHatchSpeedMultiplier: "EggHatchSpeedMultiplier",
    babyMatureSpeedMultiplier: "BabyMatureSpeedMultiplier",
    babyFoodConsumptionSpeedMultiplier: "BabyFoodConsumptionSpeedMultiplier",
    babyCuddleIntervalMultiplier: "BabyCuddleIntervalMultiplier",
    wildDinoCharacterFoodDrainMultiplier:
      "WildDinoCharacterFoodDrainMultiplier",
    tamedDinoCharacterFoodDrainMultiplier:
      "TamedDinoCharacterFoodDrainMultiplier",
    tamedDinoTorporDrainMultiplier: "TamedDinoTorporDrainMultiplier",
    wildDinoTorporDrainMultiplier: "WildDinoTorporDrainMultiplier",
    passiveTameIntervalMultiplier: "PassiveTameIntervalMultiplier",
    overrideMaxExperiencePointsPlayer: "OverrideMaxExperiencePointsPlayer",
    overrideMaxExperiencePointsDino: "OverrideMaxExperiencePointsDino",
    baseTemperatureMultiplier: "BaseTemperatureMultiplier",
  };

  for (const [frontendKey, iniKey] of Object.entries(gusMultipliers)) {
    if (body[frontendKey] !== undefined) ss[iniKey] = body[frontendKey];
  }
  for (const [frontendKey, iniKey] of Object.entries(gameMultipliers)) {
    if (body[frontendKey] !== undefined) gm[iniKey] = body[frontendKey];
  }

  const boolMap = {
    serverPVE: "ServerPVE",
    serverHardcore: "ServerHardcore",
    noTributeDownloads: "NoTributeDownloads",
    allowFlyerCarryPvE: "AllowFlyerCarryPvE",
    globalVoiceChat: "GlobalVoiceChat",
    proximityChat: "ProximityChat",
    allowThirdPersonPlayer: "AllowThirdPersonPlayer",
    showMapPlayerLocation: "ShowMapPlayerLocation",
    enablePvPGamma: "EnablePvPGamma",
    disableStructurePlacementCollision: "DisableStructurePlacementCollision",
    rconEnabled: "RCONEnabled",
    serverCrosshair: "ServerCrosshair",
    serverForceNoHUD: "ServerForceNoHUD",
    allowHitMarkers: "AllowHitMarkers",
    allowAnyoneBabyImprintCuddle: "AllowAnyoneBabyImprintCuddle",
    overrideStructurePlatformPrevention: "OverrideStructurePlatformPrevention",
    randomSupplyCratePoints: "RandomSupplyCratePoints",
  };

  for (const [frontendKey, iniKey] of Object.entries(boolMap)) {
    if (body[frontendKey] !== undefined)
      ss[iniKey] = body[frontendKey] ? "True" : "False";
  }

  if (body.disableStructurePlacementCollision !== undefined)
    gm.bDisableStructurePlacementCollision =
      body.disableStructurePlacementCollision ? "True" : "False";
  if (body.bDisableFriendlyFire !== undefined)
    gm.bDisableFriendlyFire = body.bDisableFriendlyFire ? "True" : "False";
  if (body.bAllowUnlimitedRespecs !== undefined)
    gm.bAllowUnlimitedRespecs = body.bAllowUnlimitedRespecs ? "True" : "False";
  if (body.bUseCorpseLocator !== undefined)
    gm.bUseCorpseLocator = body.bUseCorpseLocator ? "True" : "False";

  if (body.mods !== undefined) {
    ss.ActiveMods = body.mods;
    const modIdsArray = body.mods
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (modIdsArray.length > 0)
      setSection(gameConfig, "ModInstaller", { ModIDS: modIdsArray });
    else deleteSection(gameConfig, "ModInstaller");
  }

  if (body.npcReplacements && Array.isArray(body.npcReplacements)) {
    gm.NPCReplacements = body.npcReplacements.map(
      (r) => `(FromClassName="${r.from}",ToClassName="${r.to}")`,
    );
  } else {
    delete gm.NPCReplacements;
  }

  if (body.engramEntries && Array.isArray(body.engramEntries)) {
    gm.OverrideNamedEngramEntries = body.engramEntries.map(
      (e) =>
        `(EngramClassName="${e.className}",EngramLevelRequirement=${e.level},EngramPointsCost=${e.points},EngramHidden=${e.hidden ? "True" : "False"},RemoveEngramPreReq=${e.removePreReq ? "True" : "False"})`,
    );
  } else {
    delete gm.OverrideNamedEngramEntries;
  }

  if (body.craftingCosts && Array.isArray(body.craftingCosts)) {
    gm.ConfigOverrideItemCraftingCosts = body.craftingCosts.map((c) => {
      const resStrs = c.resources
        .map(
          (r) =>
            `(ResourceItemTypeString="${r.type}",BaseResourceRequirement=${r.amount},bCraftUsingSoloCrafting=False`,
        )
        .join(",");
      return `(ItemClassString="${c.itemClass}",BaseCraftingResourceRequirements=(${resStrs}))`;
    });
  } else {
    delete gm.ConfigOverrideItemCraftingCosts;
  }

  try {
    const rawGusData = serializeIniConfig(gusConfig);
    fs.writeFileSync(gusPath, rawGusData, "utf-8");

    const rawGameData = serializeIniConfig(gameConfig);
    fs.writeFileSync(gamePath, rawGameData, "utf-8");
    res.json({ message: "Settings saved successfully!" });
  } catch (err) {
    console.error("Failed to write config files:", err);
    res.status(500).json({
      error: "Failed to write configuration files to disk.",
      detail: err.message,
    });
  }
});

module.exports = router;
