import { getParent, ZhihuLink2NormalLink } from "./utils";
import { getCookie, pathAndQuery, zse93, zse96 } from "./xzse96";

export type ContentKind = "answers" | "articles" | "pins" | "questions";

export type CommentTarget = {
	kind: ContentKind;
	id: string;
};

export type ZhihuComment = {
	id: string;
	author: string;
	authorUrl: string;
	content: string;
	createdTime: string;
	likeCount: number;
	ip: string;
	replyTo: string;
	children: ZhihuComment[];
};

type RawAuthor = {
	name?: string;
	url?: string;
	fullname?: string;
	member?: { name?: string; url?: string };
	user?: { name?: string; url?: string };
};

type RawComment = {
	id?: string | number;
	comment_id?: string | number;
	content?: string;
	created_time?: number;
	like_count?: number;
	vote_count?: number;
	child_comment_count?: number;
	child_comments?: RawComment[];
	author?: RawAuthor;
	reply_to_author?: RawAuthor;
	ip_info?: string;
	comment_tag?: { type?: string; text?: string }[];
};

export type CommentProgress = {
	phase: "root" | "replies" | "dom" | "done";
	loaded: number;
	total?: number;
	replyIndex?: number;
	replyTotal?: number;
};

export type CommentProgressFn = (progress: CommentProgress) => void;

type PagingPayload = {
	data?: RawComment[];
	paging?: {
		is_end?: boolean;
		next?: string;
		totals?: number;
	};
	counts?: { total_counts?: number };
	common_counts?: number;
	error?: { message?: string; code?: number };
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** 从 JSON 文本取出 id，保持超长数字为字符串，避免 JSON.parse 把 19 位 ID 弄丢精度。 */
const extractDigitId = (raw: string, key: string): string | null => {
	const quoted = raw.match(new RegExp(`"${key}"\\s*:\\s*"(\\d+)"`));
	if (quoted) return quoted[1];
	const bare = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
	if (bare) return bare[1];
	return null;
};

const parseJsonKeepLongIds = (text: string): unknown => {
	const safe = text.replace(/:(\s*)(\d{16,})(\s*[,}\]])/g, ':"$2"$3');
	return JSON.parse(safe);
};

const parseZop = (el: Element | false | null): Record<string, unknown> | null => {
	if (!el || !(el instanceof HTMLElement)) return null;
	const raw = el.getAttribute("data-zop");
	if (!raw) return null;
	try {
		const data = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
		const itemId = extractDigitId(raw, "itemId");
		if (itemId) data.itemId = itemId;
		return data;
	} catch {
		return null;
	}
};

export const readExpectedCommentCount = (dom: HTMLElement): number | undefined => {
	const host =
		getParent(dom, "AnswerItem") ||
		getParent(dom, "Post-content") ||
		getParent(dom, "ArticleItem") ||
		getParent(dom, "PinItem") ||
		getParent(dom, "ContentItem");
	if (!host) return undefined;
	try {
		const za = JSON.parse(decodeURIComponent(host.getAttribute("data-za-extra-module") || ""));
		const n = za?.card?.content?.comment_num;
		return typeof n === "number" && n > 0 ? n : undefined;
	} catch {
		return undefined;
	}
};

/**
 * 从正文 DOM 推断评论接口用的类型和 id。
 */
export const resolveCommentTarget = (dom: HTMLElement): CommentTarget | null => {
	if (getParent(dom, "QuestionRichText")) {
		const q = document.querySelector("[data-zop-question]");
		if (q instanceof HTMLElement) {
			const raw = q.getAttribute("data-zop-question") || "";
			const qid = extractDigitId(raw, "itemId");
			if (qid) return { kind: "questions", id: qid };
		}
	}

	const zop =
		parseZop(getParent(dom, "AnswerItem")) ||
		parseZop(getParent(dom, "Post-content")) ||
		parseZop(getParent(dom, "ArticleItem")) ||
		parseZop(getParent(dom, "Post-NormalMain")) ||
		parseZop(getParent(dom, "PinItem"));

	if (!zop || zop.itemId == null) return null;
	const host =
		getParent(dom, "AnswerItem") ||
		getParent(dom, "Post-content") ||
		getParent(dom, "ArticleItem") ||
		getParent(dom, "PinItem") ||
		getParent(dom, "ContentItem");
	const zopRaw = host ? host.getAttribute("data-zop") || "" : "";
	const zaRaw = host ? host.getAttribute("data-za-extra-module") || "" : "";
	const attrId = extractDigitId(zopRaw, "itemId") || extractDigitId(zaRaw, "token") || String(zop.itemId);
	const urlId = (location.pathname.match(/\/answer\/(\d+)/) || location.pathname.match(/\/p\/(\d+)/) || location.pathname.match(/\/pin\/(\d+)/) || [])[1];
	let id = attrId;
	if (urlId && attrId && urlId !== attrId && urlId.slice(0, 12) === attrId.slice(0, 12)) {
		id = urlId;
	}
	const type = String(zop.type || "").toLowerCase();

	if (type === "answer" || getParent(dom, "AnswerItem")) return { kind: "answers", id };
	if (type === "pin" || getParent(dom, "PinItem")) return { kind: "pins", id };
	if (
		type === "article" ||
		type === "post" ||
		getParent(dom, "Post-content") ||
		getParent(dom, "Post-NormalMain") ||
		getParent(dom, "ArticleItem")
	) return { kind: "articles", id };

	return { kind: "answers", id };
};

const formatUnix = (ts: number): string => {
	if (!ts) return "";
	const d = new Date(ts * (ts > 1e12 ? 1 : 1000));
	if (Number.isNaN(d.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const commentHtmlToMarkdown = (html: string): string => {
	if (!html) return "";
	if (!/[<>]/.test(html)) return html.trim();

	const box = document.createElement("div");
	box.innerHTML = html;

	const walk = (node: Node): string => {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
		if (!(node instanceof HTMLElement)) {
			return Array.from(node.childNodes).map(walk).join("");
		}

		const tag = node.tagName.toLowerCase();
		if (tag === "br") return "\n";
		if (tag === "img") {
			const src = node.getAttribute("data-original") || node.getAttribute("src") || "";
			const alt = node.getAttribute("alt") || "图片";
			return src ? `![${alt}](${src})` : alt;
		}
		if (tag === "a") {
			let href = node.getAttribute("href") || "";
			try {
				if (href) href = ZhihuLink2NormalLink(href);
			} catch { }
			const text = Array.from(node.childNodes).map(walk).join("") || href;
			return href ? `[${text}](${href})` : text;
		}
		if (tag === "p" || tag === "div") {
			const inner = Array.from(node.childNodes).map(walk).join("");
			return inner + "\n";
		}
		return Array.from(node.childNodes).map(walk).join("");
	};

	return walk(box).replace(/\n{3,}/g, "\n\n").trim();
};

const authorName = (author?: RawAuthor): string =>
	(author?.name || author?.fullname || author?.member?.name || author?.user?.name || "").trim();

const authorUrlOf = (author?: RawAuthor): string =>
	author?.url || author?.member?.url || author?.user?.url || "";

const normalizeComment = (raw: RawComment): ZhihuComment => {
	const author = authorName(raw.author) || "匿名用户";
	const authorUrl = authorUrlOf(raw.author);
	const ipTag = (raw.comment_tag || []).find((t) => t.type === "ip_info");
	return {
		id: String(raw.id ?? raw.comment_id ?? ""),
		author,
		authorUrl,
		content: commentHtmlToMarkdown(raw.content || ""),
		createdTime: formatUnix(raw.created_time || 0),
		likeCount: raw.like_count ?? raw.vote_count ?? 0,
		ip: raw.ip_info || ipTag?.text || "",
		replyTo: authorName(raw.reply_to_author),
		children: (raw.child_comments || []).map(normalizeComment),
	};
};

const toAbsUrl = (url: string): string => {
	if (!url) return "";
	if (url.startsWith("http")) return url;
	if (url.startsWith("//")) return location.protocol + url;
	if (url.startsWith("/")) return location.origin + url;
	return url;
};

const signedHeaders = (url: string): Record<string, string> => {
	const headers: Record<string, string> = {
		Accept: "application/json",
		"x-requested-with": "fetch",
		"x-zse-93": zse93,
	};
	const dc0 = getCookie("d_c0");
	if (dc0) headers["x-zse-96"] = zse96(pathAndQuery(url), dc0);
	return headers;
};

const fetchJson = async (url: string): Promise<PagingPayload> => {
	const res = await fetch(url, {
		credentials: "include",
		headers: signedHeaders(url),
	});
	const text = await res.text();
	let data: PagingPayload | null = null;
	try {
		data = parseJsonKeepLongIds(text) as PagingPayload;
	} catch {
		data = null;
	}
	if (!res.ok) throw new Error("HTTP " + res.status);
	if (!data || data.error) {
		throw new Error(data?.error?.message || "评论接口返回错误");
	}
	return data;
};

const readTotal = (data: PagingPayload): number | undefined => {
	const n = data.paging?.totals ?? data.counts?.total_counts ?? data.common_counts;
	return typeof n === "number" && n > 0 ? n : undefined;
};

const fetchAllPages = async (
	firstUrl: string,
	maxPages: number,
	onPage?: (items: RawComment[], meta: { totals?: number; page: number }) => void,
): Promise<RawComment[]> => {
	const items: RawComment[] = [];
	let url = firstUrl;
	let totals: number | undefined;
	for (let i = 0; i < maxPages && url; i++) {
		const data = await fetchJson(url);
		if (totals == null) totals = readTotal(data);
		items.push(...(data.data || []));
		if (onPage) onPage(items, { totals, page: i + 1 });
		const pageSize = (data.data || []).length;
		if (data.paging?.is_end || pageSize === 0) break;
		url = toAbsUrl(data.paging?.next || "");
		if (!url) break;
		await sleep(280);
	}
	return items;
};

const commentRootUrls = (kind: ContentKind, id: string): string[] => {
	const origin = location.origin;
	const v5 = `${origin}/api/v4/comment_v5/${kind}/${id}/root_comment`;
	const v4 = `${origin}/api/v4/${kind}/${id}/root_comments`;
	const singular = kind.replace(/s$/, "");
	return [
		`${v5}?order_by=score&limit=20&offset=`,
		`${v5}?order_by=ts&limit=20&offset=0`,
		`${origin}/api/v4/comment_v5/comment/${singular}/${id}?order=normal&limit=20&offset=0`,
		`${v4}?order=normal&limit=20&offset=0&status=open`,
	];
};

const v5Child = (commentId: string): string =>
	`${location.origin}/api/v4/comment_v5/comment/${commentId}/child_comment?order_by=ts&limit=20&offset=`;

const fillChildren = async (
	comments: ZhihuComment[],
	raws: RawComment[],
	onProgress?: CommentProgressFn,
): Promise<void> => {
	const jobs: number[] = [];
	for (let i = 0; i < comments.length; i++) {
		const raw = raws[i];
		if (!raw) continue;
		const need = raw.child_comment_count || 0;
		if (need > comments[i].children.length && comments[i].id) jobs.push(i);
	}

	for (let j = 0; j < jobs.length; j++) {
		const i = jobs[j];
		if (onProgress) {
			onProgress({
				phase: "replies",
				loaded: countComments(comments),
				replyIndex: j + 1,
				replyTotal: jobs.length,
			});
		}
		try {
			const already = comments[i].children.length;
			const base = countComments(comments) - already;
			const childRaws = await fetchAllPages(v5Child(comments[i].id), 20, (items) => {
				if (onProgress) {
					onProgress({
						phase: "replies",
						loaded: base + items.length,
						replyIndex: j + 1,
						replyTotal: jobs.length,
					});
				}
			});
			if (childRaws.length) comments[i].children = childRaws.map(normalizeComment);
		} catch { }
		await sleep(200);
	}
};

const scrapeFromDom = (dom: HTMLElement): ZhihuComment[] => {
	const host =
		getParent(dom, "ContentItem") ||
		getParent(dom, "Post-content") ||
		getParent(dom, "PinItem") ||
		getParent(dom, "QuestionPage") ||
		document.body;

	const container =
		commentListRoot() ||
		(host as HTMLElement).querySelector(".Comments-container");
	if (!container) return [];

	const nodes = Array.from(container.querySelectorAll("[data-id]")) as HTMLElement[];
	const byId = new Map<string, ZhihuComment>();
	const roots: ZhihuComment[] = [];

	for (const el of nodes) {
		const id = el.getAttribute("data-id") || "";
		if (!id || byId.has(id)) continue;

		const contentEl = el.querySelector(".CommentContent") as HTMLElement | null;
		const authorEl = Array.from(
			el.querySelectorAll("a.UserLink-link, a[href*='/people/'], a[href*='zhihu.com/people']"),
		).find((a) => (a.textContent || "").trim()) as HTMLAnchorElement | undefined;
		const authorImg = el.querySelector("img[alt]") as HTMLImageElement | null;
		const comment: ZhihuComment = {
			id,
			author: ((authorEl && authorEl.textContent) || authorImg?.alt || "匿名用户").trim(),
			authorUrl: authorEl?.href || "",
			content: contentEl ? commentHtmlToMarkdown(contentEl.innerHTML) : (el.innerText || "").trim(),
			createdTime: "",
			likeCount: 0,
			ip: "",
			replyTo: "",
			children: [],
		};
		byId.set(id, comment);

		const parentEl = el.parentElement ? el.parentElement.closest("[data-id]") as HTMLElement | null : null;
		const parentId = parentEl ? parentEl.getAttribute("data-id") : "";
		const parentComment = parentId ? byId.get(parentId) : undefined;
		if (parentComment && parentId !== id) {
			parentComment.children.push(comment);
		} else {
			roots.push(comment);
		}
	}

	return roots;
};

const countComments = (comments: ZhihuComment[]): number =>
	comments.reduce((n, c) => n + 1 + countComments(c.children), 0);

const renderOne = (c: ZhihuComment, level: number): string => {
	const quote = level > 0 ? "> ".repeat(level) : "";
	const heading = level > 0 ? "####" : "###";
	const reply = c.replyTo ? ` › ${c.replyTo}` : "";
	const meta = [c.createdTime, c.ip, c.likeCount ? `${c.likeCount} 赞` : ""]
		.filter(Boolean)
		.join(" · ");

	const body = (c.content || "")
		.split("\n")
		.map((line) => quote + line)
		.join("\n");

	const parts = [
		`${quote}${heading} ${c.author}${reply}`,
		quote,
		body,
		quote,
		meta ? `${quote}${meta}` : "",
		quote,
	].filter((line, i, arr) => !(line === quote && arr[i - 1] === quote));

	const children = c.children.map((ch) => renderOne(ch, level + 1)).join("\n");
	return parts.join("\n") + (children ? "\n" + children : "");
};

export const commentsToMarkdown = (comments: ZhihuComment[]): string => {
	if (!comments.length) return "暂无评论。";
	const total = countComments(comments);
	const body = comments.map((c) => renderOne(c, 0)).join("\n\n");
	return `共 ${total} 条评论\n\n${body}`;
};

const isCommentUrl = (url: string): boolean =>
	/comment_v5|root_comment|root_comments|child_comment/i.test(url);

const ingestPayload = (bag: Map<string, RawComment>, payload: PagingPayload): void => {
	for (const row of payload.data || []) {
		const id = String(row.id ?? row.comment_id ?? "");
		if (!id) continue;
		const prev = bag.get(id);
		if (!prev || (row.child_comments || []).length > (prev.child_comments || []).length) {
			bag.set(id, row);
		}
		for (const child of row.child_comments || []) {
			const cid = String(child.id ?? child.comment_id ?? "");
			if (cid && !bag.has(cid)) bag.set(cid, child);
		}
	}
};

const hookCommentNetwork = (onPayload: (payload: PagingPayload) => void): (() => void) => {
	const origFetch = window.fetch.bind(window);
	window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
		const res = await origFetch(...args);
		try {
			const req = args[0];
			const url = typeof req === "string" ? req : req instanceof Request ? req.url : String(req);
			if (isCommentUrl(url)) {
				const text = await res.clone().text();
				onPayload(parseJsonKeepLongIds(text) as PagingPayload);
			}
		} catch { }
		return res;
	};

	const origOpen = XMLHttpRequest.prototype.open;
	const origSend = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.open = function () {
		(this as XMLHttpRequest & { __zhUrl?: string }).__zhUrl = String(arguments[1] || "");
		return origOpen.apply(this, arguments as unknown as Parameters<typeof origOpen>);
	} as typeof XMLHttpRequest.prototype.open;
	XMLHttpRequest.prototype.send = function () {
		this.addEventListener("load", () => {
			try {
				const url = (this as XMLHttpRequest & { __zhUrl?: string }).__zhUrl || "";
				if (isCommentUrl(url)) {
					onPayload(parseJsonKeepLongIds(this.responseText) as PagingPayload);
				}
			} catch { }
		});
		return origSend.apply(this, arguments as unknown as Parameters<typeof origSend>);
	};

	return () => {
		window.fetch = origFetch;
		XMLHttpRequest.prototype.open = origOpen;
		XMLHttpRequest.prototype.send = origSend;
	};
};

const contentHost = (dom: HTMLElement): HTMLElement =>
	(getParent(dom, "AnswerItem") ||
		getParent(dom, "Post-content") ||
		getParent(dom, "ArticleItem") ||
		getParent(dom, "PinItem") ||
		getParent(dom, "ContentItem") ||
		dom) as HTMLElement;

const commentModal = (): HTMLElement | null => {
	const modal = document.querySelector(".Modal-content") as HTMLElement | null;
	if (modal && modal.querySelector("[data-id]")) return modal;
	const wrap = document.querySelector(".Modal") as HTMLElement | null;
	if (wrap && wrap.querySelector("[data-id]")) return wrap;
	return null;
};

const commentScroller = (): HTMLElement | null => {
	const root = commentListRoot();
	if (!root) return null;
	let best: HTMLElement | null = null;
	let bestArea = 0;
	const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
	for (const el of nodes) {
		if (!(el instanceof HTMLElement)) continue;
		const s = getComputedStyle(el);
		if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 8) {
			const area = el.clientWidth * el.clientHeight;
			if (area > bestArea) {
				best = el;
				bestArea = area;
			}
		}
	}
	return best || root;
};

const commentListRoot = (): HTMLElement | null =>
	commentModal() || (document.querySelector(".Comments-container") as HTMLElement | null);

const openCommentPanel = async (host: HTMLElement): Promise<void> => {
	if (commentListRoot()) return;
	const btn = Array.from(host.querySelectorAll("button")).find((b) =>
		/条评论/.test(b.innerText || ""),
	);
	if (btn && !/收起/.test(btn.innerText || "")) {
		btn.click();
		await sleep(900);
	}
};

const inRootCommentList = (): boolean => {
	const modal = commentModal();
	if (!modal) return !!document.querySelector(".Comments-container");
	const head = (modal.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);
	return /\d+\s*条评论/.test(head);
};

const leaveReplyThread = async (): Promise<boolean> => {
	if (inRootCommentList()) return false;
	const modal = commentModal();
	if (!modal) return false;
	const box = modal.getBoundingClientRect();
	const back = Array.from(modal.querySelectorAll("button")).find((b) => {
		if (/\bModal-close/.test(b.className.toString())) return false;
		const aria = b.getAttribute("aria-label") || "";
		if (/关闭|close/i.test(aria)) return false;
		const r = b.getBoundingClientRect();
		return r.width > 8 && r.height > 8 && r.width < 72 && r.height < 72
			&& r.left < box.left + 80 && r.top < box.top + 80;
	});
	if (back) {
		back.click();
		await sleep(400);
		return true;
	}
	return false;
};

const scrollComments = (): void => {
	if (!commentModal()) {
		window.scrollBy(0, Math.max(240, Math.floor(window.innerHeight * 0.7)));
	}
	const scroller = commentScroller();
	if (!scroller) return;
	const step = Math.max(160, Math.floor(scroller.clientHeight * 0.8));
	scroller.scrollTop = Math.min(scroller.scrollTop + step, scroller.scrollHeight);
};

const driveCommentUi = async (
	dom: HTMLElement,
	expected: number | undefined,
	loaded: () => number,
	onProgress?: CommentProgressFn,
): Promise<void> => {
	const host = contentHost(dom);
	await openCommentPanel(host);
	let last = -1;
	let stable = 0;
	const started = Date.now();
	while (Date.now() - started < 120000) {
		if (!inRootCommentList()) {
			await leaveReplyThread();
			stable = 0;
			await sleep(350);
			continue;
		}
		scrollComments();
		const list = commentListRoot();
		const n = Math.max(
			loaded(),
			list ? list.querySelectorAll("[data-id]").length : 0,
		);
		if (onProgress) onProgress({ phase: "root", loaded: n, total: expected });
		if (expected && n >= expected * 0.92) break;
		if (n <= last) stable += 1;
		else stable = 0;
		last = n;
		if (stable >= 8) break;
		await sleep(400);
	}
};

const rawsToTree = (raws: RawComment[]): ZhihuComment[] => {
	const roots = raws.filter((r) => !authorName(r.reply_to_author));
	if (roots.length) return roots.map(normalizeComment);
	return raws.map(normalizeComment);
};

/**
 * 先让页面自己打开评论并滚动加载（截获知乎已签名的请求），不够再打接口，最后才扒 DOM。
 */
export const fetchComments = async (
	dom: HTMLElement,
	onProgress?: CommentProgressFn,
): Promise<ZhihuComment[]> => {
	const expected = readExpectedCommentCount(dom);
	const bag = new Map<string, RawComment>();
	const unhook = hookCommentNetwork((payload) => ingestPayload(bag, payload));

	try {
		if (onProgress) onProgress({ phase: "root", loaded: 0, total: expected });
		await driveCommentUi(dom, expected, () => bag.size, onProgress);

		if (bag.size > 0) {
			const raws = Array.from(bag.values());
			let comments = rawsToTree(raws);
			if (!comments.length) comments = raws.map(normalizeComment);
			const got = countComments(comments);
			const enough = !expected || expected < 30 || got >= expected * 0.85;
			if (enough) {
				await fillChildren(comments, raws, onProgress);
				if (onProgress) onProgress({ phase: "done", loaded: countComments(comments), total: expected });
				return comments;
			}
		}

		const target = resolveCommentTarget(dom);
		if (target) {
			const tryUrls = commentRootUrls(target.kind, target.id);
			for (const url of tryUrls) {
				try {
					if (onProgress) onProgress({ phase: "root", loaded: bag.size, total: expected });
					const raws = await fetchAllPages(url, 40, (items, meta) => {
						if (onProgress) {
							onProgress({
								phase: "root",
								loaded: items.length,
								total: meta.totals || expected,
							});
						}
					});
					if (!raws.length) continue;
					const comments = raws.map(normalizeComment);
					const got = countComments(comments);
					if (expected && expected >= 30 && got <= 12) continue;
					await fillChildren(comments, raws, onProgress);
					if (onProgress) onProgress({ phase: "done", loaded: countComments(comments), total: expected });
					return comments;
				} catch { }
			}
		}

		if (onProgress) onProgress({ phase: "dom", loaded: 0, total: expected });
		const scraped = scrapeFromDom(dom);
		if (onProgress) onProgress({ phase: "done", loaded: countComments(scraped), total: expected });
		return scraped;
	} finally {
		unhook();
	}
};
