/*
 * @purpose Read-only bubo mobile application shell.
 * @role    Owns MaterialApp setup and bottom-tab navigation.
 * @deps    demo_data.dart, screens.dart, theme.dart.
 * @gotcha  Navigation is allowed, but financial data mutations are desktop-only.
 */
import 'dart:ui';

import 'package:flutter/material.dart';

import 'data/mobile_ledger_repository.dart';
import 'demo_data.dart';
import 'screens.dart';
import 'theme.dart';

class BuboMobileApp extends StatelessWidget {
  const BuboMobileApp({super.key, this.loadSqlite = true});

  final bool loadSqlite;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'bubo',
      debugShowCheckedModeBanner: false,
      theme: buboTheme,
      home: loadSqlite
          ? const _BuboLedgerBootstrap()
          : const BuboReadOnlyShell(),
    );
  }
}

class _BuboLedgerBootstrap extends StatefulWidget {
  const _BuboLedgerBootstrap();

  @override
  State<_BuboLedgerBootstrap> createState() => _BuboLedgerBootstrapState();
}

class _BuboLedgerBootstrapState extends State<_BuboLedgerBootstrap> {
  late final Future<void> _load = _loadLedger();

  Future<void> _loadLedger() async {
    final snapshot = await MobileLedgerRepository.loadBundledDemoLedger();
    DemoData.useSnapshot(snapshot);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _load,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done) {
          if (snapshot.hasError) {
            return _LedgerLoadError(error: snapshot.error);
          }
          return const BuboReadOnlyShell();
        }

        return const Scaffold(
          backgroundColor: BuboColors.surface,
          body: SafeArea(
            child: Center(
              child: Text(
                '加载 Desktop SQLite',
                style: TextStyle(color: BuboColors.ink3, fontSize: 12),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _LedgerLoadError extends StatelessWidget {
  const _LedgerLoadError({required this.error});

  final Object? error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BuboColors.surface,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(BuboSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.storage_outlined,
                  color: BuboColors.ink3,
                  size: 30,
                ),
                const SizedBox(height: BuboSpacing.md),
                const Text(
                  'SQLite 读取失败',
                  style: TextStyle(
                    color: BuboColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: BuboSpacing.sm),
                Text(
                  '$error',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: BuboColors.ink3,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class BuboReadOnlyShell extends StatefulWidget {
  const BuboReadOnlyShell({super.key});

  @override
  State<BuboReadOnlyShell> createState() => _BuboReadOnlyShellState();
}

class _BuboReadOnlyShellState extends State<BuboReadOnlyShell> {
  int _tab = 0;

  static const _screens = [
    DashboardScreen(),
    CalendarScreen(),
    BudgetScreen(),
    FixedScreen(),
    AssetsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BuboColors.surface,
      body: Stack(
        children: [
          Positioned.fill(
            child: IndexedStack(index: _tab, children: _screens),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _ReadOnlyTabBar(
              currentIndex: _tab,
              onChanged: (index) => setState(() => _tab = index),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReadOnlyTabBar extends StatelessWidget {
  const _ReadOnlyTabBar({required this.currentIndex, required this.onChanged});

  final int currentIndex;
  final ValueChanged<int> onChanged;

  static const _items = [
    _TabItem(label: '看板', icon: Icons.dashboard_outlined),
    _TabItem(label: '花费', icon: Icons.receipt_long_outlined),
    _TabItem(label: '预算', icon: Icons.speed_outlined),
    _TabItem(label: '固定', icon: Icons.event_repeat_outlined),
    _TabItem(label: '资产', icon: Icons.account_balance_wallet_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.88),
            border: const Border(
              top: BorderSide(color: BuboColors.hair, width: 0.5),
            ),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                BuboSpacing.md,
                BuboSpacing.md + 1,
                BuboSpacing.md,
                BuboSpacing.md - 1,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < _items.length; i++)
                    Expanded(
                      child: _TabButton(
                        item: _items[i],
                        active: i == currentIndex,
                        onTap: () => onChanged(i),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.item,
    required this.active,
    required this.onTap,
  });

  final _TabItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? BuboColors.accent : BuboColors.ink4;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(BuboRadius.md + 2),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: BuboSpacing.xs),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(item.icon, size: 22, color: color),
            const SizedBox(height: BuboSpacing.xs + 1),
            Text(
              item.label,
              style: BuboTextStyles.tabLabel.copyWith(
                color: color,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabItem {
  const _TabItem({required this.label, required this.icon});

  final String label;
  final IconData icon;
}
