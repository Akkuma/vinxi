import { test } from "@playwright/test";
import spawn, { sync as spawnSync } from "cross-spawn";
import fse from "fs-extra";
import { readFile } from "fs/promises";
import getPort from "get-port";
import path from "path";
import c from "picocolors";
import stripIndent from "strip-indent";
import { fileURLToPath } from "url";
import waitOn from "wait-on";

export function testDevAndProd(name, fn) {
	test.describe(`${name}-dev`, async () => {
		await fn({
			createFixture: createDevFixture,
		});
	});

	test.describe(`${name}-prod`, async () => {
		await fn({
			createFixture: createFixture,
		});
	});
}

const TMP_DIR = path.join(
	path.dirname(path.dirname(fileURLToPath(import.meta.url))),
	".fixtures",
);

interface FixtureInit {
	buildStdio?: boolean;
	sourcemap?: boolean;
	template?: string;
	files: { [filename: string]: string };
}

export type Fixture = Awaited<ReturnType<typeof createFixture>>;
export type DevFixture = Awaited<ReturnType<typeof createDevFixture>>;
export type AppFixture = Awaited<
	ReturnType<Awaited<ReturnType<typeof createFixture>>["createServer"]>
>;

export const js = String.raw;
export const mdx = String.raw;
export const css = String.raw;
export function json(value: object) {
	return JSON.stringify(value, null, 2);
}

export async function createDevFixture(init: FixtureInit) {
	let projectDir = await createFixtureProject(init);

	let ip = "localhost";
	let port = await getPort();
	let proc = spawn("node", ["node_modules/vinxi/bin/cli.mjs", "dev"], {
		cwd: projectDir,
		env: {
			...process.env,
			PORT: `${port}`,
			IP: ip,
		},
	});

	proc.stdout?.pipe(process.stdout);
	proc.stderr?.pipe(process.stderr);

	await waitOn(
		{
			resources: [`http://${ip}:${port}/favicon.ico`],
			validateStatus: function (status) {
				return status >= 200 && status < 310; // default if not provided
			},
		},
		undefined,
	);

	let getStaticHTML = async () => {
		let text = await readFile(
			path.join(projectDir, "dist", "client", "index.html"),
			"utf8",
		);
		return new Response(text, {
			headers: {
				"content-type": "text/html",
			},
		});
	};

	let requestDocument = async (href: string, init?: RequestInit) => {
		let url = new URL(href, `http://${ip}:${port}`);
		let request = new Request(url, init);
		try {
			return await fetch(request);
		} catch (err) {
			console.error(err);
			return new Response(err.message, {
				status: 500,
			});
		}
	};

	let postDocument = async (href: string, data: URLSearchParams | FormData) => {
		return await requestDocument(href, {
			method: "POST",
			body: data,
			headers: {
				"Content-Type":
					data instanceof URLSearchParams
						? "application/x-www-form-urlencoded"
						: "multipart/form-data",
			},
		});
	};

	let getBrowserAsset = async (asset: string) => {
		return await fse.readFile(
			path.join(projectDir, "public", asset.replace(/^\//, "")),
			"utf8",
		);
	};

	const cache = new Map<string, string | null>();

	return {
		projectDir,
		requestDocument,
		postDocument,
		getBrowserAsset,
		reset: async () => {
			for (const [filename, prevValue] of cache.entries()) {
				if (prevValue === null) {
					await fse.remove(path.join(projectDir, filename));
				} else {
					await fse.writeFile(path.join(projectDir, filename), prevValue);
					await new Promise((r) => setTimeout(r, 2000));
				}
			}
			cache.clear();
			// await fse.remove(projectDir);
			// projectDir = await createFixtureProject(init);
		},
		deleteFile: async (filename: string) => {
			if (!cache.has(filename)) {
				cache.set(filename, null);
			}

			await fse.remove(path.join(projectDir, filename));
		},
		updateFile: async (filename: string, content: string) => {
			const prevValue = (await fse.exists(path.join(projectDir, filename)))
				? await fse.readFile(path.join(projectDir, filename), {
						encoding: "utf8",
				  })
				: null;

			if (!cache.has(filename)) {
				cache.set(filename, prevValue);
			}

			await fse.writeFile(path.join(projectDir, filename), content);
			await new Promise((r) => setTimeout(r, 2000));
		},
		createServer: async () => {
			return {
				serverUrl: `http://${ip}:${port}`,
				close: async () => {
					proc.kill();
				},
			};
		},
	};
}

export async function createFixture(init: FixtureInit) {
	let projectDir = await createFixtureProject(init);
	await build(projectDir, init.buildStdio);
	let buildPath = path.resolve(projectDir, ".output", "server", "index.mjs");
	if (!fse.existsSync(buildPath)) {
		throw new Error(
			c.red(
				`Expected build directory to exist at ${c.dim(
					buildPath,
				)}. The build probably failed. Did you maybe have a syntax error in your test code strings?`,
			),
		);
	}

	let ip = "localhost";
	let port = await getPort();
	let proc = spawn("node", [".output/server/index.mjs"], {
		cwd: projectDir,
		env: {
			...process.env,
			PORT: `${port}`,
			IP: ip,
		},
	});

	proc.stdout?.pipe(process.stdout);
	proc.stderr?.pipe(process.stderr);

	await waitOn(
		{
			resources: [`http://${ip}:${port}/favicon.ico`],
			validateStatus: function (status) {
				return status >= 200 && status < 310; // default if not provided
			},
		},
		undefined,
	);

	let getStaticHTML = async () => {
		let text = await readFile(
			path.join(projectDir, "dist", "client", "index.html"),
			"utf8",
		);
		return new Response(text, {
			headers: {
				"content-type": "text/html",
			},
		});
	};

	let requestDocument = async (href: string, init?: RequestInit) => {
		let url = new URL(href, `http://${ip}:${port}`);
		let request = new Request(url, init);
		try {
			return await fetch(request);
		} catch (err) {
			console.error(err);
			return new Response(err.message, {
				status: 500,
			});
		}
	};

	let postDocument = async (href: string, data: URLSearchParams | FormData) => {
		return await requestDocument(href, {
			method: "POST",
			body: data,
			headers: {
				"Content-Type":
					data instanceof URLSearchParams
						? "application/x-www-form-urlencoded"
						: "multipart/form-data",
			},
		});
	};

	let getBrowserAsset = async (asset: string) => {
		return await fse.readFile(
			path.join(projectDir, "public", asset.replace(/^\//, "")),
			"utf8",
		);
	};

	return {
		projectDir,
		requestDocument,
		postDocument,
		getBrowserAsset,
		createServer: async () => {
			return {
				serverUrl: `http://${ip}:${port}`,
				close: async () => {
					proc.kill();
				},
			};
		},
	};
}

////////////////////////////////////////////////////////////////////////////////
export async function createFixtureProject(init: FixtureInit): Promise<string> {
	let template = init.template ?? "react";
	let dirname = path.dirname(
		path.dirname(path.join(fileURLToPath(import.meta.url))),
	);
	let info = test.info();
	let pName = info.titlePath
		.slice(1, info.titlePath.length - 1)
		.map((s) => s.replace(/ /g, "-"))
		.join("-");
	let integrationTemplateDir = path.join(dirname, "templates", template);
	test;
	let projectName = `${pName}-${Math.random().toString(32).slice(2)}`;
	let projectDir = path.join(TMP_DIR, projectName);

	await fse.ensureDir(projectDir);
	await fse.copy(integrationTemplateDir, projectDir);

	await writeTestFiles(init, projectDir);

	return projectDir;
}

function build(projectDir: string, buildStdio?: boolean) {
	let proc = spawnSync("npm", ["run", "build"], {
		cwd: projectDir,
	});

	if (proc.error) {
		console.error(proc.error);
	}

	if (buildStdio) {
		console.log(proc.stdout.toString());
	}
	console.error(proc.stderr.toString());
}

async function writeTestFiles(init: FixtureInit, dir: string) {
	await Promise.all(
		Object.keys(init.files).map(async (filename) => {
			let filePath = path.join(dir, filename);
			await fse.ensureDir(path.dirname(filePath));
			await fse.writeFile(filePath, stripIndent(init.files[filename]));
		}),
	);
}
