
import { saveAs } from "file-saver";
import { MakeButton, getParent } from "./core/utils";
import NormalItem from "./situation/NormalItem";
import * as JSZip from "jszip";
import PinItem from "./situation/PinItem";
import { commentsToMarkdown, fetchComments } from "./core/comments";
import type { CommentProgressFn } from "./core/comments";
import { hideCommentProgress, shortCommentProgress, showCommentProgress } from "./core/commentProgress";

type ResultType = {
	markdown: string[],
	zip: JSZip,
	title: string,
	dom: HTMLElement,
	itemId?: string,
	question?: boolean,
};

const allResults: ResultType[] = [];

const AddResult = (result: ResultType) => {
	// 如果 result.dom 与其他的 dom 不重复，就添加
	if (allResults.every((item) => item.dom !== result.dom)) allResults.push(result);
};

const COMMENT_MARKDOWN_SUFFIX = "\n\n---\n\n## 评论\n\n";

const ensureCommentsInZip = async (
	result: ResultType,
	onProgress?: CommentProgressFn,
): Promise<string> => {
	const existing = result.zip.file("comments.md");
	if (existing) {
		const text = await existing.async("string");
		if (text && text !== "暂无评论。") return text;
	}

	const comments = await fetchComments(result.dom, onProgress);
	const markdown = commentsToMarkdown(comments);
	result.zip.file("comments.md", markdown);
	return markdown;
};


// 将 allResults[i].zip 合并为一个 zip 并下载
const downloadAllResults = async (
	onProgress?: (done: number, total: number, text?: string) => void,
) => {
	const zip = new JSZip();
	const total = allResults.length;

	for (let i = 0; i < allResults.length; i++) {
		const item = allResults[i];
		const prefix = `回答 ${i + 1}/${total}`;
		if (onProgress) onProgress(i + 1, total, prefix + " · 准备评论");
		try {
			await ensureCommentsInZip(item, (p) => {
				showCommentProgress(p, prefix);
				if (onProgress) onProgress(i + 1, total, prefix + " · " + shortCommentProgress(p));
			});
		} catch (e) {
			console.log(e);
		}

		const folderName = `${item.title}-${item.itemId}`;
		Object.keys(item.zip.files).forEach(val => {
			zip.files[folderName + "/" + val] = item.zip.files[val];
		});
	}

	saveAs(await zip.generateAsync({ type: "blob" }),
		`问题『${allResults[0].title}』下的${allResults.length}个回答.zip`
	);

	console.log(zip);

	return zip;
};


const main = async () => {

	console.log("Starting…");

	const RichTexts = Array.from(document.querySelectorAll(".RichText")) as HTMLElement[];

	const Titles = Array.from(document.getElementsByClassName("QuestionHeader-title")) as HTMLElement[];

	for (let RichText of RichTexts) {

		try {

			// 去掉重复的按钮
			let RichTextChilren = Array.from(RichText.children) as HTMLElement[];

			for (let i = 1; i < RichTextChilren.length; i++) {
				const el = RichTextChilren[i];
				if (el.classList.contains("zhihucopier-button")) el.remove();
				else break;
			}
		} catch { }

		try {

			try {

				if (RichText.parentElement.classList.contains("Editable")) continue;

				if (RichText.children[0].classList.contains("zhihucopier-button")) continue;

				if (RichText.children[0].classList.contains("Image-Wrapper-Preview")) continue;

				if (getParent(RichText, "PinItem")) {
					const richInner = getParent(RichText, "RichContent-inner");
					if (richInner && richInner.querySelector(".ContentItem-more")) continue;
				};

			} catch { }


			// 按钮组
			const ButtonContainer = document.createElement("div");
			RichText.prepend(ButtonContainer);
			ButtonContainer.classList.add("zhihucopier-button");

			let result: ResultType;

			if (getParent(RichText, "PinItem")) {
				// 想法

				const richInner = getParent(RichText, "RichContent-inner");

				if (richInner && richInner.querySelector(".ContentItem-more")) continue;

				const res = await PinItem(RichText);

				result = {
					markdown: res.markdown,
					zip: res.zip,
					title: res.title,
					dom: RichText,
					itemId: res.itemId,
				};
			} else {
				// 回答

				const res = await NormalItem(RichText);

				result = {
					markdown: res.markdown,
					zip: res.zip,
					title: res.title,
					dom: RichText,
					itemId: res.itemId,
				};

				if (getParent(RichText, "QuestionRichText")) {
					result.question = true;
					result.itemId = "问题描述";
				}
			};

			AddResult(result);


			// 下载为Zip
			const ButtonZipDownload = MakeButton();
			ButtonZipDownload.innerHTML = "下载全文为Zip";
			ButtonZipDownload.style.borderRadius = "0 1em 1em 0";
			ButtonZipDownload.style.width = "100px";
			ButtonZipDownload.style.paddingRight = ".4em";

			ButtonContainer.prepend(ButtonZipDownload);

			ButtonZipDownload.addEventListener("click", async () => {
				const originWidth = ButtonZipDownload.style.width;
				try {
					ButtonZipDownload.style.width = "160px";
					ButtonZipDownload.innerHTML = "正在获取评论…";
					await ensureCommentsInZip(result, (p) => {
						showCommentProgress(p);
						ButtonZipDownload.innerHTML = shortCommentProgress(p);
					});

					const blob = await result.zip.generateAsync({ type: "blob" });
					saveAs(blob, result.title + "-" + result.itemId + ".zip");

					ButtonZipDownload.innerHTML = "下载成功✅";
					setTimeout(() => {
						ButtonZipDownload.innerHTML = "下载全文为Zip";
						ButtonZipDownload.style.width = originWidth;
					}, 1000);
				} catch {
					ButtonZipDownload.innerHTML = "发生未知错误<br>请联系开发者";
					ButtonZipDownload.style.height = "4em";
					setTimeout(() => {
						ButtonZipDownload.style.height = "2em";
						ButtonZipDownload.style.width = originWidth;
						ButtonZipDownload.innerHTML = "下载全文为Zip";
					}, 1000);
				} finally {
					hideCommentProgress();
				}
			});


			// 复制为Markdown
			const ButtonCopyMarkdown = MakeButton();
			ButtonCopyMarkdown.innerHTML = "复制为Markdown";
			ButtonCopyMarkdown.style.borderRadius = "1em 0 0 1em";
			ButtonCopyMarkdown.style.paddingLeft = ".4em";
			ButtonContainer.prepend(ButtonCopyMarkdown);

			ButtonCopyMarkdown.addEventListener("click", async () => {
				const originWidth = ButtonCopyMarkdown.style.width;
				try {
					ButtonCopyMarkdown.style.width = "160px";
					ButtonCopyMarkdown.innerHTML = "正在获取评论…";
					const commentMarkdown = await ensureCommentsInZip(result, (p) => {
						showCommentProgress(p);
						ButtonCopyMarkdown.innerHTML = shortCommentProgress(p);
					});
					const text = result.markdown.join("\n\n")
						+ (commentMarkdown ? COMMENT_MARKDOWN_SUFFIX + commentMarkdown : "");
					navigator.clipboard.writeText(text);
					ButtonCopyMarkdown.innerHTML = "复制成功✅";
					setTimeout(() => {
						ButtonCopyMarkdown.innerHTML = "复制为Markdown";
						ButtonCopyMarkdown.style.width = originWidth;
					}, 1000);
				} catch {
					ButtonCopyMarkdown.innerHTML = "发生未知错误<br>请联系开发者";
					ButtonCopyMarkdown.style.height = "4em";
					setTimeout(() => {
						ButtonCopyMarkdown.style.height = "2em";
						ButtonCopyMarkdown.style.width = originWidth;
						ButtonCopyMarkdown.innerHTML = "复制为Markdown";
					}, 1000);
				} finally {
					hideCommentProgress();
				}
			});


		} catch (e) {
			console.log(e);
		}

	}


	// 下载该问题下的所有回答
	Titles.forEach((titleItem) => {


		if (titleItem.querySelector(".zhihucopier-button")) return;

		// 按钮
		const Button = MakeButton();
		Button.style.width = "75px";
		// Button.style.height = "30px";
		Button.style.fontSize = "13px";
		Button.style.lineHeight = "13px";
		Button.style.margin = "0";
		Button.innerHTML = "批量下载";

		Button.classList.add("zhihucopier-button");


		if (getParent(titleItem, "App-main")) {
			titleItem.append(Button);
		} else {
			Button.style.marginRight = ".4em";
			titleItem.prepend(Button);
		}


		Button.addEventListener("click", async (e) => {
			e.stopPropagation();
			e.preventDefault();

			try {
				Button.style.width = "180px";
				Button.innerHTML = "正在获取评论…";
				await downloadAllResults((_done, _total, text) => {
					if (text) Button.innerHTML = text;
				});
				Button.style.width = "90px";
				Button.innerHTML = "下载成功✅";
				setTimeout(() => {
					Button.innerHTML = "批量下载";
					Button.style.width = "75px";
				}, 1000);

			} catch {
				Button.style.width = "190px";
				Button.innerHTML = "发生未知错误，请联系开发者";
				setTimeout(() => {
					Button.innerHTML = "批量下载";
					Button.style.width = "75px";
				}, 1000);
			} finally {
				hideCommentProgress();
			}
		});
	});
};


setTimeout(main, 300);

setInterval(main, 1000);