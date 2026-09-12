import md5 from "md5";

const ZSE93 = "101_3_3.0";

function i(e: number, t: number[], n: number): void {
	t[n] = 255 & (e >>> 24);
	t[n + 1] = 255 & (e >>> 16);
	t[n + 2] = 255 & (e >>> 8);
	t[n + 3] = 255 & e;
}

function B(e: number[], t: number): number {
	return ((255 & e[t]) << 24) | ((255 & e[t + 1]) << 16) | ((255 & e[t + 2]) << 8) | (255 & e[t + 3]);
}

function Q(e: number, t: number): number {
	return ((4294967295 & e) << t) | (e >>> (32 - t));
}

const h = {
	zk: [
		1170614578, 1024848638, 1413669199, -343334464, -766094290, -1373058082,
		-143119608, -297228157, 1933479194, -971186181, -406453910, 460404854,
		-547427574, -1891326262, -1679095901, 2119585428, -2029270069, 2035090028,
		-1521520070, -5587175, -77751101, -2094365853, -1243052806, 1579901135,
		1321810770, 456816404, -1391643889, -229302305, 330002838, -788960546,
		363569021, -1947871109,
	],
	zb: [
		20, 223, 245, 7, 248, 2, 194, 209, 87, 6, 227, 253, 240, 128, 222, 91, 237, 9, 125, 157, 230, 93, 252, 205, 90, 79, 144, 199, 159, 197, 186, 167, 39, 37, 156, 198, 38, 42, 43, 168, 217, 153, 15, 103, 80, 189, 71, 191, 97, 84,
		247, 95, 36, 69, 14, 35, 12, 171, 28, 114, 178, 148, 86, 182, 32, 83, 158, 109, 22, 255, 94, 238, 151, 85, 77, 124, 254, 18, 4, 26, 123, 176, 232, 193, 131, 172, 143, 142, 150, 30, 10, 146, 162, 62, 224, 218, 196, 229, 1,
		192, 213, 27, 110, 56, 231, 180, 138, 107, 242, 187, 54, 120, 19, 44, 117, 228, 215, 203, 53, 239, 251, 127, 81, 11, 133, 96, 204, 132, 41, 115, 73, 55, 249, 147, 102, 48, 122, 145, 106, 118, 74, 190, 29, 16, 174, 5, 177,
		129, 63, 113, 99, 31, 161, 76, 246, 34, 211, 13, 60, 68, 207, 160, 65, 111, 82, 165, 67, 169, 225, 57, 112, 244, 155, 51, 236, 200, 233, 58, 61, 47, 100, 137, 185, 64, 17, 70, 234, 163, 219, 108, 170, 166, 59, 149, 52, 105,
		24, 212, 78, 173, 45, 0, 116, 226, 119, 136, 206, 135, 175, 195, 25, 92, 121, 208, 126, 139, 3, 75, 141, 21, 130, 98, 241, 40, 154, 66, 184, 49, 181, 46, 243, 88, 101, 183, 8, 23, 72, 188, 104, 179, 210, 134, 250, 201, 164,
		89, 216, 202, 220, 50, 221, 152, 140, 33, 235, 214,
	],
};

function G(e: number): number {
	const t = new Array(4);
	const n = new Array(4);
	i(e, t, 0);
	n[0] = h.zb[255 & t[0]];
	n[1] = h.zb[255 & t[1]];
	n[2] = h.zb[255 & t[2]];
	n[3] = h.zb[255 & t[3]];
	const r = B(n, 0);
	return r ^ Q(r, 2) ^ Q(r, 10) ^ Q(r, 18) ^ Q(r, 24);
}

const __g = {
	x(e: number[], t: number[]): number[] {
		let n: number[] = [];
		for (let r = e.length, idx = 0; 0 < r; r -= 16) {
			const a = new Array(16);
			const o = e.slice(16 * idx, 16 * (idx + 1));
			for (let c = 0; c < 16; c++) a[c] = o[c] ^ t[c];
			t = __g.r(a);
			n = n.concat(t);
			idx++;
		}
		return n;
	},
	r(e: number[]): number[] {
		const t = new Array(16);
		const n = new Array(36);
		n[0] = B(e, 0);
		n[1] = B(e, 4);
		n[2] = B(e, 8);
		n[3] = B(e, 12);
		for (let r = 0; r < 32; r++) {
			const o = G(n[r + 1] ^ n[r + 2] ^ n[r + 3] ^ h.zk[r]);
			n[r + 4] = n[r] ^ o;
		}
		i(n[35], t, 0);
		i(n[34], t, 4);
		i(n[33], t, 8);
		i(n[32], t, 12);
		return t;
	},
};

const encodeChunk = (param: number): string => {
	const salt = "6fpLRqJO8M/c3jnYxFkUVC4ZIG12SiH=5v0mXDazWBTsuw7QetbKdoPyAl+hN9rgE";
	let result = "";
	for (const x of [0, 6, 12, 18]) {
		result += salt.charAt((param >>> x) & 63);
	}
	return result;
};

const preProcess = (md5Str: string): number[] => {
	const md5CharCodeAtArr: number[] = [];
	for (let idx = 0; idx < md5Str.length; idx++) {
		md5CharCodeAtArr.push(md5Str.charCodeAt(idx));
	}
	md5CharCodeAtArr.unshift(0);
	md5CharCodeAtArr.unshift(Math.floor(Math.random() * 127));
	for (let idx = 0; idx < 15; idx++) md5CharCodeAtArr.push(14);

	const md5CharCodeAtFrontArr = md5CharCodeAtArr.slice(0, 16);
	const fixArr = [48, 53, 57, 48, 53, 51, 102, 55, 100, 49, 53, 101, 48, 49, 100, 55];
	const newArr: number[] = [];
	for (let idx = 0; idx < md5CharCodeAtFrontArr.length; idx++) {
		newArr.push(md5CharCodeAtFrontArr[idx] ^ fixArr[idx] ^ 42);
	}

	const gR = __g.r(newArr);
	const md5CharCodeAtBackArr = md5CharCodeAtArr.slice(16, 48);
	const gX = __g.x(md5CharCodeAtBackArr, gR);
	return gR.concat(gX);
};

const encrypt = (md5Str: string): string => {
	const processed = preProcess(md5Str);
	let current = 0;
	let resultStr = "";
	for (let idx = 0; idx < processed.length; idx++) {
		const pop = processed[processed.length - idx - 1];
		const iMod4 = idx % 4;
		const iMod3 = idx % 3;
		const d = pop ^ ((58 >>> (8 * iMod4)) & 255);
		current |= d << (8 * iMod3);
		if (iMod3 === 2) {
			resultStr += encodeChunk(current);
			current = 0;
		}
	}
	return resultStr;
};

export const getCookie = (name: string): string => {
	const parts = document.cookie.split(";");
	for (const part of parts) {
		const trimmed = part.trim();
		const eq = trimmed.indexOf("=");
		if (eq < 0) continue;
		if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
	}
	return "";
};

export const pathAndQuery = (url: string): string => {
	const u = new URL(url, location.origin);
	return u.pathname + u.search;
};

export const zse96 = (apiPath: string, dc0: string): string => {
	const f = `${ZSE93}+${apiPath}+${dc0}`;
	return "2.0_" + encrypt(md5(f));
};

export const zse93 = ZSE93;
