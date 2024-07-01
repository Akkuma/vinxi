import { expect, test } from "@playwright/test";

import type { AppFixture, Fixture } from "./helpers/create-fixture.js";
import { testDevAndProd } from "./helpers/create-fixture.js";
import { PlaywrightFixture } from "./helpers/playwright-fixture.js";

testDevAndProd("toWebRequest", ({ createFixture }) => {
	let fixture: Fixture;
	let appFixture: AppFixture;

	test.beforeAll(async () => {
		fixture = await createFixture({
			files: {},
			template: "react-to-web-request",
		});

		appFixture = await fixture.createServer();
	});

	test.afterAll(async () => {
		await appFixture.close();
	});

	let logs: string[] = [];

	test.beforeEach(({ page }) => {
		page.on("console", (msg) => {
			logs.push(msg.text());
		});
	});

	test("readBody call after toWebRequest does not block", async ({ page }) => {
		let app = new PlaywrightFixture(appFixture, page);
		await app.goto("/", true);
		await app.isReady();

		const el = await page.$("[data-test-id=button]");
		await el.click();

		const responses = app.collectResponses();
		await new Promise((resolve) => setTimeout(resolve, 200));
		test.expect(responses.length).toBe(1);
	});
});
