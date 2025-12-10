import { Icon } from "@iconify/vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import "./custom.css";

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("Icon", Icon);
	},
} satisfies Theme;
