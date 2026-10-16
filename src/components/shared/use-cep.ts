"use client";

import { useState } from "react";
import { toast } from "sonner";

export type CepAddress = { street: string; district: string; city: string; state: string; complement?: string };

/** Busca endereço no ViaCEP quando o CEP fica completo. */
export function useCep(onFound: (addr: CepAddress) => void) {
  const [loading, setLoading] = useState(false);

  async function lookup(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro: string;
        bairro: string;
        localidade: string;
        uf: string;
        complemento: string;
      };
      if (data.erro) {
        toast.warning("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      onFound({
        street: data.logradouro,
        district: data.bairro,
        city: data.localidade,
        state: data.uf,
        complement: data.complemento,
      });
    } catch {
      toast.error("Não foi possível consultar o CEP agora.");
    } finally {
      setLoading(false);
    }
  }

  return { lookup, loading };
}
