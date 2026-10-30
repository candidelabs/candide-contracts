import hre from "hardhat";
import { expect } from "chai";
import { SOCIAL_RECOVERY_MODULE_ADDRESSES, socialRecoveryModuleAddress } from "../rocketh/expected_addresses.js";

// Recomputes every pinned deployment address from the build, so that a change that moves an
// address (sources, line endings, compiler settings, dependencies) has to update the pin in the
// same change. The deploy script performs the same check before sending any transaction.
describe("Expected deployment addresses", () => {
  it("pins a SocialRecoveryModule address per recovery period, each matching the build", async () => {
    const artifact = await hre.artifacts.readArtifact("SocialRecoveryModule");
    expect(SOCIAL_RECOVERY_MODULE_ADDRESSES).to.not.be.empty;
    const recoveryPeriods = new Set(SOCIAL_RECOVERY_MODULE_ADDRESSES.map((entry) => entry.recoveryPeriod));
    expect(recoveryPeriods.size, "duplicate recovery period").to.equal(SOCIAL_RECOVERY_MODULE_ADDRESSES.length);
    for (const { label, recoveryPeriod, address } of SOCIAL_RECOVERY_MODULE_ADDRESSES) {
      expect(recoveryPeriod, label).to.be.greaterThan(0n);
      expect(socialRecoveryModuleAddress(artifact.bytecode, recoveryPeriod), label).to.equal(address);
    }
  });
});
