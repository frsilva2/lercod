#!/usr/bin/env node
/**
 * FERRAMENTA DE DEBUG - Sistema de Inventário
 *
 * Uso:
 *   node testar.js                    # Roda todos os testes
 *   node testar.js "CODIGO_AQUI"      # Testa um código específico
 *   node testar.js --buscar "4170"    # Busca produto por código parcial
 *   node testar.js --listar           # Lista todos os produtos
 */

const fs = require('fs');
const readline = require('readline');

// Cores para terminal
const c = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m'
};

// Carregar produtos do JSON
let PRODUTOS_DB = [];
let prodIndex = {};

function carregarProdutos() {
    try {
        const data = fs.readFileSync('./depra.json', 'utf8');
        PRODUTOS_DB = JSON.parse(data);

        PRODUTOS_DB.forEach(p => {
            const cod = String(p.codigo_produto);
            prodIndex[cod] = {
                produto: cod,
                descricao: p.produto,
                cod_prod_erp: p.cod_erp,
                nome_prod_erp: p.nome_erp,
                fornecedor_grupo: p.fornecedor
            };
        });

        console.log(`${c.green}✓ ${PRODUTOS_DB.length} produtos carregados${c.reset}`);
        console.log(`${c.green}✓ ${Object.keys(prodIndex).length} códigos únicos no índice${c.reset}\n`);
        return true;
    } catch(e) {
        console.error(`${c.red}✗ Erro ao carregar depra.json: ${e.message}${c.reset}`);
        return false;
    }
}

// Função de busca (mesma lógica do index.html)
function buscarProd(cod) {
    // 1. Busca exata
    if (prodIndex[cod]) {
        return { ...prodIndex[cod], metodo: 'exato' };
    }

    // 2. Remove zeros à esquerda
    const semZeros = cod.replace(/^0+/, '');
    if (prodIndex[semZeros]) {
        return { ...prodIndex[semZeros], metodo: 'sem_zeros' };
    }

    // 3. Remove zeros à direita também (normaliza)
    const normalizado = semZeros.replace(/0+$/, '');
    for (let c in prodIndex) {
        const cNorm = c.replace(/^0+/, '').replace(/0+$/, '');
        if (normalizado === cNorm) {
            return { ...prodIndex[c], metodo: 'normalizado', baseUsada: normalizado };
        }
    }

    // 4. Compara primeiros N dígitos (3 a 6)
    for (let tam = 6; tam >= 3; tam--) {
        if (semZeros.length < tam) continue;
        const prefixo = semZeros.substring(0, tam);
        for (let c in prodIndex) {
            const cSemZeros = c.replace(/^0+/, '');
            if (cSemZeros.length >= tam && cSemZeros.substring(0, tam) === prefixo) {
                return { ...prodIndex[c], metodo: `prefixo_${tam}`, baseUsada: prefixo };
            }
        }
    }

    return null;
}

// Função de decodificação (mesma lógica do index.html)
function decodificar(qr) {
    const tam = qr.length;

    if (tam === 33) {
        const cod = qr.substring(5, 13);
        const qtd = parseFloat(qr.substring(14, 19));
        const prod = buscarProd(cod);

        return {
            tipo: 'LITORAL',
            tamanho: tam,
            codigo_extraido: cod,
            quantidade: qtd,
            controle: qr.substring(19, 33),
            produto: prod,
            requer_cor: true,
            erro: prod ? null : `Produto ${cod} não encontrado`
        };
    }
    else if (tam === 45 && qr.startsWith('01')) {
        const cod = qr.substring(11, 18);
        const cor = qr.substring(27, 30).replace(/^0+/, '') || '0';
        const qtd = parseFloat(qr.substring(37, 42));
        const prod = buscarProd(cod);

        return {
            tipo: 'EUROTEXTIL',
            tamanho: tam,
            po: qr.substring(2, 8),
            codigo_extraido: cod,
            cor: cor,
            sequencia: qr.substring(31, 36).replace(/^0+/, '') || '0',
            quantidade: qtd,
            produto: prod,
            requer_cor: false,
            erro: prod ? null : `Produto ${cod} não encontrado`
        };
    }

    return {
        tipo: 'DESCONHECIDO',
        tamanho: tam,
        erro: `Código inválido (${tam} dígitos, esperado 33 ou 45)`
    };
}

// Exibir resultado formatado
function exibirResultado(codigo, resultado) {
    console.log(`${c.bold}${'═'.repeat(60)}${c.reset}`);
    console.log(`${c.bold}CÓDIGO:${c.reset} ${codigo}`);
    console.log(`${c.bold}TAMANHO:${c.reset} ${resultado.tamanho} dígitos`);
    console.log(`${c.bold}TIPO:${c.reset} ${resultado.tipo}`);
    console.log(`${'─'.repeat(60)}`);

    if (resultado.tipo === 'LITORAL') {
        console.log(`${c.cyan}Estrutura LITORAL (33 dígitos):${c.reset}`);
        console.log(`  Posição 5-12  (código):     ${c.yellow}${resultado.codigo_extraido}${c.reset}`);
        console.log(`  Posição 14-18 (quantidade): ${c.yellow}${resultado.quantidade} MT${c.reset}`);
        console.log(`  Posição 19-32 (controle):   ${c.dim}${resultado.controle}${c.reset}`);
        console.log(`  Cor: ${c.yellow}MANUAL (operador digita)${c.reset}`);
    }
    else if (resultado.tipo === 'EUROTEXTIL') {
        console.log(`${c.blue}Estrutura EUROTEXTIL GS1 (45 dígitos):${c.reset}`);
        console.log(`  Posição 2-7   (PO):         ${c.dim}${resultado.po}${c.reset}`);
        console.log(`  Posição 11-17 (código):     ${c.yellow}${resultado.codigo_extraido}${c.reset}`);
        console.log(`  Posição 27-29 (cor):        ${c.yellow}#${resultado.cor}${c.reset}`);
        console.log(`  Posição 31-35 (sequência):  ${c.dim}${resultado.sequencia}${c.reset}`);
        console.log(`  Posição 37-41 (quantidade): ${c.yellow}${resultado.quantidade} MT${c.reset}`);
    }

    console.log(`${'─'.repeat(60)}`);

    if (resultado.erro) {
        console.log(`${c.red}${c.bold}✗ ERRO: ${resultado.erro}${c.reset}`);

        // Sugestões de debug
        if (resultado.codigo_extraido) {
            console.log(`\n${c.yellow}Sugestões:${c.reset}`);
            const semZeros = resultado.codigo_extraido.replace(/^0+/, '');
            console.log(`  1. Código sem zeros: ${semZeros}`);

            for (let corte = 2; corte <= 4; corte++) {
                if (resultado.codigo_extraido.length > corte) {
                    const base = resultado.codigo_extraido.slice(0, -corte).replace(/^0+/, '');
                    console.log(`  ${corte}. Base (corte ${corte}): ${base}`);
                }
            }

            // Buscar produtos similares
            console.log(`\n${c.yellow}Produtos similares no banco:${c.reset}`);
            const baseSearch = resultado.codigo_extraido.slice(0, 4).replace(/^0+/, '');
            let encontrados = 0;
            for (let cod in prodIndex) {
                if (cod.includes(baseSearch) && encontrados < 5) {
                    console.log(`  - ${cod}: ${prodIndex[cod].descricao.substring(0, 40)}`);
                    encontrados++;
                }
            }
            if (encontrados === 0) {
                console.log(`  ${c.dim}Nenhum produto encontrado com "${baseSearch}"${c.reset}`);
            }
        }
    }
    else {
        console.log(`${c.green}${c.bold}✓ SUCESSO!${c.reset}`);
        console.log(`  Método de busca: ${c.cyan}${resultado.produto.metodo}${c.reset}`);
        if (resultado.produto.baseUsada) {
            console.log(`  Base usada: ${resultado.produto.baseUsada}`);
        }
        console.log(`\n${c.bold}Produto encontrado:${c.reset}`);
        console.log(`  Código:    ${resultado.produto.produto}`);
        console.log(`  Descrição: ${resultado.produto.descricao}`);
        console.log(`  ERP:       ${resultado.produto.cod_prod_erp} - ${resultado.produto.nome_prod_erp}`);
        console.log(`  Fornecedor: ${resultado.produto.fornecedor_grupo}`);
    }

    console.log(`${'═'.repeat(60)}\n`);
}

// Códigos de teste
const TESTES = [
    // LITORAL
    { nome: 'LITORAL - SATIN INDONESIA', codigo: '000000326022600007400025117100856' },
    { nome: 'LITORAL - HELANCA LIGHT', codigo: '000004170000000012300099887766554' },
    { nome: 'LITORAL - AIR FLOW SLUB', codigo: '000516000000000050000123456789012' },

    // EUROTEXTIL
    { nome: 'EURO - CREPE AMANDA', codigo: '010000000005142100000000000012000010005000000' },
    { nome: 'EURO - TWO WAY SPAN', codigo: '010000000006691030000000000025000010010000000' },
];

// Buscar produtos
function buscarProdutos(termo) {
    console.log(`\n${c.bold}Buscando: "${termo}"${c.reset}\n`);

    let encontrados = 0;
    for (let cod in prodIndex) {
        const p = prodIndex[cod];
        if (cod.includes(termo) ||
            p.descricao.toLowerCase().includes(termo.toLowerCase()) ||
            p.nome_prod_erp.toLowerCase().includes(termo.toLowerCase())) {
            console.log(`${c.yellow}${cod}${c.reset}`);
            console.log(`  ${p.descricao}`);
            console.log(`  ${c.dim}ERP: ${p.cod_prod_erp} - ${p.nome_prod_erp}${c.reset}`);
            console.log(`  ${c.dim}Fornecedor: ${p.fornecedor_grupo}${c.reset}\n`);
            encontrados++;
            if (encontrados >= 20) {
                console.log(`${c.dim}... e mais resultados (mostrando 20)${c.reset}`);
                break;
            }
        }
    }

    if (encontrados === 0) {
        console.log(`${c.red}Nenhum produto encontrado${c.reset}`);
    } else {
        console.log(`${c.green}${encontrados} produto(s) encontrado(s)${c.reset}`);
    }
}

// Listar todos os produtos
function listarProdutos() {
    console.log(`\n${c.bold}TODOS OS PRODUTOS (${Object.keys(prodIndex).length})${c.reset}\n`);

    // Agrupar por fornecedor
    const porFornecedor = {};
    for (let cod in prodIndex) {
        const p = prodIndex[cod];
        const forn = p.fornecedor_grupo.includes('LITORAL') ? 'LITORAL' : 'EUROTEXTIL';
        if (!porFornecedor[forn]) porFornecedor[forn] = [];
        porFornecedor[forn].push({ cod, ...p });
    }

    for (let forn in porFornecedor) {
        console.log(`\n${c.bold}${forn} (${porFornecedor[forn].length} produtos)${c.reset}`);
        console.log('─'.repeat(60));
        porFornecedor[forn].slice(0, 10).forEach(p => {
            console.log(`  ${c.yellow}${p.cod}${c.reset} - ${p.descricao.substring(0, 40)}`);
        });
        if (porFornecedor[forn].length > 10) {
            console.log(`  ${c.dim}... e mais ${porFornecedor[forn].length - 10}${c.reset}`);
        }
    }
}

// Modo interativo
async function modoInterativo() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.cyan}    MODO INTERATIVO - Sistema de Inventário Debug${c.reset}`);
    console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════${c.reset}`);
    console.log(`\nComandos:`);
    console.log(`  ${c.yellow}[código]${c.reset}     - Testar um código de barras`);
    console.log(`  ${c.yellow}buscar TERMO${c.reset} - Buscar produto por nome/código`);
    console.log(`  ${c.yellow}testes${c.reset}       - Rodar todos os testes automáticos`);
    console.log(`  ${c.yellow}listar${c.reset}       - Listar todos os produtos`);
    console.log(`  ${c.yellow}ajuda${c.reset}        - Mostrar estrutura dos códigos`);
    console.log(`  ${c.yellow}sair${c.reset}         - Sair\n`);

    const perguntar = () => {
        rl.question(`${c.cyan}> ${c.reset}`, (input) => {
            const cmd = input.trim();

            if (!cmd) {
                perguntar();
                return;
            }

            if (cmd === 'sair' || cmd === 'exit' || cmd === 'q') {
                console.log('Até logo!');
                rl.close();
                return;
            }

            if (cmd === 'testes') {
                console.log(`\n${c.bold}EXECUTANDO TESTES AUTOMÁTICOS${c.reset}\n`);
                TESTES.forEach(t => {
                    console.log(`${c.dim}Testando: ${t.nome}${c.reset}`);
                    const resultado = decodificar(t.codigo);
                    exibirResultado(t.codigo, resultado);
                });
                perguntar();
                return;
            }

            if (cmd === 'listar') {
                listarProdutos();
                perguntar();
                return;
            }

            if (cmd.startsWith('buscar ')) {
                const termo = cmd.substring(7);
                buscarProdutos(termo);
                perguntar();
                return;
            }

            if (cmd === 'ajuda') {
                console.log(`
${c.bold}ESTRUTURA LITORAL (33 dígitos):${c.reset}
┌─────────┬─────────┬───┬─────────┬────────────────┐
│ 0-4     │ 5-12    │13 │ 14-18   │ 19-32          │
│ Prefixo │ Código  │   │ Qtd MT  │ Controle       │
└─────────┴─────────┴───┴─────────┴────────────────┘
Cor: MANUAL

${c.bold}ESTRUTURA EUROTEXTIL GS1 (45 dígitos, começa com 01):${c.reset}
┌────┬───────┬─────┬────────┬──────────┬─────┬───┬───────┬───┬───────┬─────┐
│0-1 │ 2-7   │8-10 │ 11-17  │ 18-26    │27-29│30 │ 31-35 │36 │ 37-41 │42-44│
│ 01 │ PO    │     │ Código │          │ Cor │   │ Seq   │   │ Qtd   │     │
└────┴───────┴─────┴────────┴──────────┴─────┴───┴───────┴───┴───────┴─────┘
Cor: AUTOMÁTICA
`);
                perguntar();
                return;
            }

            // Assumir que é um código de barras
            if (/^\d+$/.test(cmd)) {
                const resultado = decodificar(cmd);
                exibirResultado(cmd, resultado);
            } else {
                console.log(`${c.yellow}Comando não reconhecido. Digite 'ajuda' para ver opções.${c.reset}`);
            }

            perguntar();
        });
    };

    perguntar();
}

// Main
console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
console.log(`${c.bold}${c.cyan}║     FERRAMENTA DE DEBUG - Sistema de Inventário          ║${c.reset}`);
console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}\n`);

if (!carregarProdutos()) {
    process.exit(1);
}

const args = process.argv.slice(2);

if (args.length === 0) {
    // Modo interativo
    modoInterativo();
}
else if (args[0] === '--listar') {
    listarProdutos();
}
else if (args[0] === '--buscar' && args[1]) {
    buscarProdutos(args[1]);
}
else if (args[0] === '--testes') {
    console.log(`\n${c.bold}EXECUTANDO TESTES AUTOMÁTICOS${c.reset}\n`);
    TESTES.forEach(t => {
        console.log(`${c.dim}Testando: ${t.nome}${c.reset}`);
        const resultado = decodificar(t.codigo);
        exibirResultado(t.codigo, resultado);
    });
}
else {
    // Testar código específico
    const codigo = args.join('');
    const resultado = decodificar(codigo);
    exibirResultado(codigo, resultado);
}
