"use client";

import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Password field with a show/hide toggle (JMB fork). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, "type">>(
	({ className, ...props }, ref) => {
		const { t } = useLanguage();
		const [visible, setVisible] = useState(false);
		const label = visible ? t("auth.hidePassword") : t("auth.showPassword");
		return (
			<div className="relative">
				<Input ref={ref} {...props} type={visible ? "text" : "password"} className={cn("pr-11", className)} />
				<button
					type="button"
					onClick={() => setVisible((value) => !value)}
					aria-label={label}
					aria-pressed={visible}
					title={label}
					className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-neutral-500 hover:text-neutral-800 focus-visible:outline-none focus-visible:text-blue-600"
				>
					{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
				</button>
			</div>
		);
	},
);
PasswordInput.displayName = "PasswordInput";
