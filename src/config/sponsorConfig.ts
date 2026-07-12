import type { SponsorConfig } from "../types/config";

export const sponsorConfig: SponsorConfig = {
	title: "赞助",

	description: "感谢您的支持，您的赞助将帮助我持续创作优质内容",

	usage: "",

	showSponsorsList: true,

	showComment: true,

	showButtonInPost: true,

	methods: [
		{
			name: "微信",
			qrCode: "/assets/images/sponsor/wechat.png",
			enabled: true,
		},
		{
			name: "支付宝",
			qrCode: "/assets/images/sponsor/alipay.png",
			enabled: true,
		},
	],

	sponsors: [
	],
};
