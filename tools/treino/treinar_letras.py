#!/usr/bin/env python3
"""Treina o modelo de letras usado para conferir a escrita à caneta.

Roda no GitHub Actions (.github/workflows/treinar-letras.yml), não no app.
Dados: EMNIST Letters (letras manuscritas, 26 classes, maiúsculas e
minúsculas juntas), baixado pelo torchvision direto do NIST.

Saída, na pasta modelo/:
  letras.json              arquitetura, ordem das classes e onde está cada peso
  letras.bin               pesos em float16 little-endian, na ordem do json
  letras-verificacao.json  imagens de teste com as saídas esperadas, para
                           conferir se a inferência em JavaScript bate com esta

A rede é pequena de propósito: roda em JavaScript puro (js/reconhecer.js),
sem framework, em menos de 1 s para a grade inteira no tablet.

Entrada: imagem 28×28 em pé (o EMNIST vem transposto; aqui é desvirado),
fundo 0 e tinta 1, letra centralizada como no EMNIST (caixa da tinta num
quadrado com 2 px de margem).
"""

import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

RAIZ = Path(__file__).resolve().parents[2]
DADOS = RAIZ / "dados"
SAIDA = RAIZ / "modelo"
CLASSES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

ROTULOS = 26
EPOCAS = 12
LOTE = 256

torch.manual_seed(0)
random.seed(0)
torch.set_num_threads(max(1, torch.get_num_threads()))


class Desvirar:
    """O EMNIST guarda as imagens transpostas; deixa a letra em pé."""
    def __call__(self, x):
        return x.transpose(1, 2)


class EspessuraAleatoria:
    """Varia a grossura do traço (canetas diferentes): engrossa ou afina um pouco."""
    def __call__(self, x):
        r = random.random()
        if r < 0.3:
            grossa = F.max_pool2d(x[None], 3, 1, 1)[0]
            x = torch.maximum(x, grossa * random.uniform(0.5, 0.9))
        elif r < 0.5:
            x = x ** random.uniform(1.5, 2.5)
        return x


class Rede(nn.Module):
    # conv 3×3 (mesmo tamanho) + ReLU + max-pool 2×2, três vezes; depois duas densas.
    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(1, 32, 3, padding=1)
        self.c2 = nn.Conv2d(32, 64, 3, padding=1)
        self.c3 = nn.Conv2d(64, 64, 3, padding=1)
        self.d1 = nn.Linear(64 * 3 * 3, 128)
        self.d2 = nn.Linear(128, ROTULOS)
        self.drop = nn.Dropout(0.3)

    def forward(self, x):
        x = F.max_pool2d(F.relu(self.c1(x)), 2)   # 28 -> 14
        x = F.max_pool2d(F.relu(self.c2(x)), 2)   # 14 -> 7
        x = F.max_pool2d(F.relu(self.c3(x)), 2)   # 7 -> 3
        x = x.flatten(1)                          # ordem C, H, W
        x = self.drop(F.relu(self.d1(x)))
        return self.d2(x)


def carregar():
    base = [transforms.ToTensor(), Desvirar()]
    treino_tf = transforms.Compose(base + [
        transforms.RandomAffine(degrees=12, translate=(0.08, 0.08), scale=(0.85, 1.1), shear=12),
        EspessuraAleatoria(),
    ])
    teste_tf = transforms.Compose(base)
    # rótulos do EMNIST Letters vão de 1 a 26
    alvo = lambda y: y - 1
    treino = datasets.EMNIST(DADOS, split="letters", train=True, download=True,
                             transform=treino_tf, target_transform=alvo)
    teste = datasets.EMNIST(DADOS, split="letters", train=False, download=True,
                            transform=teste_tf, target_transform=alvo)
    return treino, teste


def avaliar(rede, carregador):
    rede.eval()
    certas = total = 0
    certas_top3 = 0
    with torch.no_grad():
        for x, y in carregador:
            saida = rede(x)
            certas += (saida.argmax(1) == y).sum().item()
            certas_top3 += (saida.topk(3, 1).indices == y[:, None]).any(1).sum().item()
            total += len(y)
    return certas / total, certas_top3 / total


def exportar(rede, teste, precisao, precisao_top3):
    SAIDA.mkdir(exist_ok=True)
    rede.eval()
    camadas, blocos, deslocamento = [], [], 0

    def guardar(tensor):
        nonlocal deslocamento
        dados = tensor.detach().cpu().numpy().astype("<f2").ravel()
        inicio = deslocamento
        blocos.append(dados.tobytes())
        deslocamento += dados.size
        return {"inicio": inicio, "tamanho": int(dados.size)}

    for conv in (rede.c1, rede.c2, rede.c3):
        camadas.append({
            "tipo": "conv", "entrada": conv.in_channels, "saida": conv.out_channels, "k": 3,
            "pesos": guardar(conv.weight), "vies": guardar(conv.bias),  # pesos [saida, entrada, k, k]
        })
        camadas.append({"tipo": "relu"})
        camadas.append({"tipo": "pool"})
    camadas.append({"tipo": "achatar"})
    camadas.append({"tipo": "densa", "entrada": rede.d1.in_features, "saida": rede.d1.out_features,
                    "pesos": guardar(rede.d1.weight), "vies": guardar(rede.d1.bias)})  # [saida, entrada]
    camadas.append({"tipo": "relu"})
    camadas.append({"tipo": "densa", "entrada": rede.d2.in_features, "saida": rede.d2.out_features,
                    "pesos": guardar(rede.d2.weight), "vies": guardar(rede.d2.bias)})

    (SAIDA / "letras.bin").write_bytes(b"".join(blocos))
    descricao = {
        "versao": 1,
        "dados": "EMNIST Letters (NIST)",
        "formato": "float16-le",
        "entrada": [1, 28, 28],
        "classes": CLASSES,
        "precisao_teste": round(precisao, 4),
        "precisao_teste_top3": round(precisao_top3, 4),
        "camadas": camadas,
    }
    (SAIDA / "letras.json").write_text(json.dumps(descricao, indent=1) + "\n", encoding="utf-8")

    # Algumas imagens de teste com a saída do PyTorch (pesos já arredondados para
    # float16, iguais aos que o JavaScript vai ler), para conferir a inferência em JS.
    with torch.no_grad():
        for p in rede.parameters():
            p.copy_(p.half().float())
        exemplos = []
        for i in range(0, 40 * 997, 997):
            x, y = teste[i]
            saida = rede(x[None])[0]
            exemplos.append({
                "letra": CLASSES[y],
                "imagem": [round(v, 3) for v in x[0].ravel().tolist()],
                "saida": [round(v, 4) for v in saida.tolist()],
            })
    (SAIDA / "letras-verificacao.json").write_text(json.dumps(exemplos) + "\n", encoding="utf-8")


def main():
    inicio = time.time()
    treino, teste = carregar()
    print(f"treino: {len(treino)} letras · teste: {len(teste)} letras", flush=True)
    carregador = DataLoader(treino, batch_size=LOTE, shuffle=True, num_workers=2)
    carregador_teste = DataLoader(teste, batch_size=1024, num_workers=2)

    rede = Rede()
    otimizador = torch.optim.AdamW(rede.parameters(), lr=2e-3, weight_decay=1e-4)
    agenda = torch.optim.lr_scheduler.OneCycleLR(otimizador, max_lr=3e-3,
                                                 total_steps=EPOCAS * len(carregador))
    for epoca in range(1, EPOCAS + 1):
        rede.train()
        for x, y in carregador:
            otimizador.zero_grad()
            perda = F.cross_entropy(rede(x), y, label_smoothing=0.05)
            perda.backward()
            otimizador.step()
            agenda.step()
        precisao, top3 = avaliar(rede, carregador_teste)
        print(f"época {epoca}: teste {precisao:.4f} (top-3 {top3:.4f}) · {time.time() - inicio:.0f} s", flush=True)

    exportar(rede, teste, precisao, top3)
    print(f"modelo salvo em {SAIDA} · {time.time() - inicio:.0f} s")


if __name__ == "__main__":
    main()
