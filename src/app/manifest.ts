import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "JMB Tecnologia Mail",
		short_name: "JMB Mail",
		description: "E-mail, agenda e arquivos da JMB Tecnologia.",
		lang: "pt-BR",
		dir: "ltr",
		id: "/",
		scope: "/",
		start_url: "/inbox",
		display: "standalone",
		orientation: "portrait",
		background_color: "#0e3554",
		theme_color: "#ffffff",
		categories: ["productivity", "business"],
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
			{ src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
			{ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
		shortcuts: [
			{ name: "Caixa de entrada", url: "/inbox", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] },
			{ name: "Escrever e-mail", url: "/compose", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] },
			{ name: "Agenda", url: "/calendar", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] },
		],
	};
}
