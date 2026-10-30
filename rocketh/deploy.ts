import { type Accounts, type Data, type Extensions, extensions } from "./config.js";
import * as artifacts from "../generated/artifacts/index.js";
import { setupDeployScripts } from "rocketh";

const { deployScript } = setupDeployScripts<Extensions, Accounts, Data>(extensions);

export { artifacts, deployScript };
