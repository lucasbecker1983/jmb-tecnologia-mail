"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type Props = { domain: string | null; invalid: boolean; describedBy?: string };

/**
 * JMB fork: on webmail.<domain>, people type only the part before the @ and the domain is
 * shown fixed. A full address still works. The hidden "email" field keeps the login request unchanged.
 */
export function LoginEmailField({ domain, invalid, describedBy }: Props) {
	const [value, setValue] = useState("");
	if (!domain) {
		return (
			<Input
				id="email"
				name="email"
				type="email"
				autoComplete="username webauthn"
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				required
			/>
		);
	}
	const typed = value.trim();
	const hasDomain = typed.includes("@");
	const email = !typed ? "" : hasDomain ? typed : `${typed}@${domain}`;
	return (
		<>
			<div className="flex items-stretch">
				<Input
					id="email"
					type="text"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					autoComplete="username webauthn"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					inputMode="email"
					aria-invalid={invalid || undefined}
					aria-describedby={describedBy}
					className={hasDomain ? undefined : "rounded-r-none"}
					required
				/>
				{!hasDomain && (
					<span className="flex items-center rounded-r-md border border-l-0 border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500 select-none">
						@{domain}
					</span>
				)}
			</div>
			<input type="hidden" name="email" value={email} />
		</>
	);
}
