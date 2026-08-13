#!/usr/bin/env node
import {readFile} from "node:fs/promises";
const wrapper=await readFile(new URL("../apps/browser/main.mjs",import.meta.url),"utf8"),core=await readFile(new URL("../apps/browser/main-core.mjs",import.meta.url),"utf8"),launch=await readFile(new URL("../apps/browser/chromium-launch.mjs",import.meta.url