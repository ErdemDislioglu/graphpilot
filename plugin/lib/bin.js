#!/usr/bin/env node
import { buildCli } from "./cli.js";
buildCli().parseAsync(process.argv);
