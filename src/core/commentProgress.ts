import type { CommentProgress } from "./comments";

const STYLE_ID = "zhihucopier-progress-style";
const HOST_ID = "zhihucopier-progress";

const ensureStyle = (): void => {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
@keyframes zhihucopier-indet {
	0% { transform: translateX(-100%); }
	100% { transform: translateX(250%); }
}
#${HOST_ID} {
	position: fixed;
	top: 16px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 2147483646;
	min-width: 280px;
	max-width: 90vw;
	padding: 12px 16px 14px;
	border-radius: 10px;
	background: rgba(32, 32, 32, 0.94);
	color: #fff;
	font-size: 13px;
	line-height: 1.4;
	box-shadow: 0 8px 24px rgba(0,0,0,.28);
	pointer-events: none;
}
#${HOST_ID} .zhihucopier-progress-title {
	font-weight: 600;
	margin-bottom: 4px;
}
#${HOST_ID} .zhihucopier-progress-bar {
	height: 6px;
	margin-top: 8px;
	border-radius: 99px;
	background: rgba(255,255,255,.18);
	overflow: hidden;
}
#${HOST_ID} .zhihucopier-progress-fill {
	height: 100%;
	width: 0;
	border-radius: 99px;
	background: #5b8def;
	transition: width .2s ease;
}
#${HOST_ID} .zhihucopier-progress-fill.is-indet {
	width: 40%;
	animation: zhihucopier-indet 1.1s ease-in-out infinite;
}
`;
	document.head.appendChild(style);
};

const ensureHost = (): HTMLDivElement => {
	ensureStyle();
	let host = document.getElementById(HOST_ID) as HTMLDivElement | null;
	if (!host) {
		host = document.createElement("div");
		host.id = HOST_ID;
		host.innerHTML = `
			<div class="zhihucopier-progress-title"></div>
			<div class="zhihucopier-progress-desc"></div>
			<div class="zhihucopier-progress-bar"><div class="zhihucopier-progress-fill"></div></div>
		`;
		document.documentElement.appendChild(host);
	}
	host.style.display = "block";
	return host;
};

const formatProgress = (progress: CommentProgress, prefix?: string): { title: string; desc: string; ratio?: number } => {
	const head = prefix ? prefix + " · " : "";
	if (progress.phase === "root") {
		const desc = progress.total
			? `一级评论 ${progress.loaded} / ${progress.total}`
			: `已获取一级评论 ${progress.loaded} 条`;
		return {
			title: head + "正在拉取评论",
			desc,
			ratio: progress.total ? Math.min(1, progress.loaded / progress.total) : undefined,
		};
	}
	if (progress.phase === "replies") {
		const reply = (progress.replyIndex && progress.replyTotal)
			? `楼中楼 ${progress.replyIndex} / ${progress.replyTotal}`
			: "正在拉取楼中楼";
		return {
			title: head + "正在拉取回复",
			desc: `${reply} · 已 ${progress.loaded} 条`,
			ratio: (progress.replyIndex && progress.replyTotal)
				? Math.min(1, progress.replyIndex / progress.replyTotal)
				: undefined,
		};
	}
	if (progress.phase === "dom") {
		return { title: head + "正在读取页面评论", desc: "接口不可用，改为解析已展开的评论区" };
	}
	return { title: head + "评论拉取完成", desc: `共 ${progress.loaded} 条`, ratio: 1 };
};

export const showCommentProgress = (progress: CommentProgress, prefix?: string): void => {
	const host = ensureHost();
	const view = formatProgress(progress, prefix);
	(host.querySelector(".zhihucopier-progress-title") as HTMLElement).textContent = view.title;
	(host.querySelector(".zhihucopier-progress-desc") as HTMLElement).textContent = view.desc;
	const fill = host.querySelector(".zhihucopier-progress-fill") as HTMLElement;
	if (view.ratio == null) {
		fill.classList.add("is-indet");
		fill.style.width = "40%";
	} else {
		fill.classList.remove("is-indet");
		fill.style.width = Math.round(view.ratio * 100) + "%";
	}
};

export const hideCommentProgress = (): void => {
	const host = document.getElementById(HOST_ID);
	if (host) host.style.display = "none";
};

export const shortCommentProgress = (progress: CommentProgress): string => {
	if (progress.phase === "root") {
		return progress.total ? `评论 ${progress.loaded}/${progress.total}` : `评论 ${progress.loaded}`;
	}
	if (progress.phase === "replies") {
		return (progress.replyIndex && progress.replyTotal)
			? `回复 ${progress.replyIndex}/${progress.replyTotal}`
			: `评论 ${progress.loaded}`;
	}
	if (progress.phase === "dom") return "读取页面评论";
	return `已获取 ${progress.loaded}`;
};
