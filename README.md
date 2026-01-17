<p align="center">
  <img src="./assets/void-dex-logo.svg" alt="VoidDex" width="200" />
</p>

Privacy-first DEX aggregator backend. Aggregates quotes from multiple DEXes and finds optimal swap routes using a graph-based pathfinding system. Built with NestJS.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

## Core Features

- **Quote Aggregation**: Fetches quotes from Uniswap V3, SushiSwap, and more
- **Graph-Based Routing**: LiquidityGraph + PathfinderService for optimal routes
- **Split Routing**: Splits trades across multiple DEXes for better rates
- **Multi-Hop Routing**: Finds paths through intermediate tokens
- **Fee Calculation**: WETH-denominated fees with broadcaster support

## API Endpoints

```bash
# Get swap quote
GET /quote?chainId=1&fromToken=ETH&toToken=USDC&amount=1000000000000000000

# Get supported tokens
GET /tokens?chainId=1

# Get supported DEXes
GET /dexes?chainId=1
```

## Documentation

For detailed documentation, visit [https://pzza.works/products/void-dex](https://pzza.works/products/void-dex)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

VoidDex Team - [https://pzza.works/products/void-dex](https://pzza.works/products/void-dex)

Project Link: [https://github.com/pzzaworks/void-dex-api](https://github.com/pzzaworks/void-dex-api)
