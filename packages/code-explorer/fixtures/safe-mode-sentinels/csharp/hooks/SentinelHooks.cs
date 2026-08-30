using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Diagnostics;

namespace SafeModeSentinel;

internal static class Tripwire
{
    internal static void Trigger(string hook)
    {
        var tripwire = Environment.GetEnvironmentVariable("CODE_EXPLORER_SENTINEL_PATH");
        if (string.IsNullOrWhiteSpace(tripwire)) return;
        File.WriteAllText($"{tripwire}.{hook}", hook);
    }
}

[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class SentinelAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor Rule = new(
        "SENTINEL001",
        "Sentinel analyzer loaded",
        "Sentinel analyzer loaded",
        "Safety",
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => [Rule];

    public override void Initialize(AnalysisContext context)
    {
        Tripwire.Trigger("analyzer-initialize");
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
    }
}

[Generator(LanguageNames.CSharp)]
public sealed class SentinelGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        Tripwire.Trigger("generator-initialize");
    }
}
