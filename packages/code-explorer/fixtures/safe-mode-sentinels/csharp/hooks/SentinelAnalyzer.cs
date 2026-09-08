using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Diagnostics;

namespace SafeModeSentinel;

[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class SentinelAnalyzer : DiagnosticAnalyzer
{
    private readonly string analyzerHook = "analyzer-initialize";

    private static readonly DiagnosticDescriptor Rule = new(
        "SENTINEL001",
        "Sentinel analyzer loaded",
        "Sentinel analyzer loaded",
        "Safety",
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        [Rule];

    public override void Initialize(AnalysisContext context)
    {
        Tripwire.Trigger(analyzerHook);
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
    }
}
