"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const cifNif = formData.get("cifNif") as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: cifNif,
  });

  if (error) {
    return { error: "Email o CIF/NIF incorrectos. Comprueba tus datos e inténtalo de nuevo." };
  }

  redirect("/dashboard");
}
