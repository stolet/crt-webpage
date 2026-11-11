// Shared with analysis/idle-cycles-balance/parameters.json.
window.IdleBalance = Object.freeze({
  "presentationSeconds": 10,
  "simulationSeconds": 1200,
  "shortBurstSeconds": 12,
  "longBurstSeconds": 120,
  "activeFractions": [
    0.1,
    0.9,
    0.9,
    0.1
  ],
  "peakPacketRate": 84.2,
  "packetDeadlineSeconds": 0.22,
  "pauseWakeSeconds": 0.08,
  "blockWakeSeconds": 0.3,
  "lendHandoffSeconds": 0.08,
  "lendCacheRecoverySeconds": 6,
  "lendCacheRateMultiplier": 0.1,
  "freeIdlePower": 0.05,
  "pauseIdlePower": 0.08,
  "sleepIdlePower": 0.005,
  "workingPower": 1,
  "powerCap": 8.4,
  "maximumClockFactor": 1,
  "heatDegreesPerSimulatedSecond": 0.2,
  "missLimit": 0.05,
  "level2MinimumApplicationRate": 65,
  "violationPenaltyExponent": 8,
  "applicationRequirementExponent": 4,
  "latencyBonusWeight": 0.1,
  "initialSearchStepSeconds": 0.02,
  "seed": 4242,
  "centerQuietGap": true,
  "validationStepSeconds": 0.005,
  "medalThresholds": {
    "bronze": 350,
    "silver": 800,
    "gold": 975
  },
  "scoreReferences": {
    "1": 151.40478301,
    "2": 73.54104545,
    "3": 77.2530558,
    "4": 152.70021544
  }
});
