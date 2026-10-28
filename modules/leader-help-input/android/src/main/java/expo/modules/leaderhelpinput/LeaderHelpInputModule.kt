package expo.modules.leaderhelpinput

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class HelpInputState : Record {
  @Field var text: String = ""
  @Field var eventCount: Int = 0
}

class LeaderHelpInputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LeaderHelpInput")
    Constants("apiVersion" to 1)
    View(LeaderHelpInputView::class) {
      Events("onTextEdited", "onGeometry")
      Prop("textState") { view: LeaderHelpInputView, state: HelpInputState -> view.setTextState(state) }
      Prop("placeholder") { view: LeaderHelpInputView, value: String -> view.editor.hint = value }
      Prop("textColor") { view: LeaderHelpInputView, value: String -> view.setTextColor(value) }
      Prop("hintColor") { view: LeaderHelpInputView, value: String -> view.setHintColor(value) }
      Prop("accentColor") { view: LeaderHelpInputView, value: String -> view.setAccentColor(value) }
      Prop("editable") { view: LeaderHelpInputView, value: Boolean -> view.editor.isEnabled = value }
      Prop("reducedMotion") { view: LeaderHelpInputView, value: Boolean -> view.reducedMotion = value }
      AsyncFunction("focusInput") { view: LeaderHelpInputView -> view.focusInput() }
      AsyncFunction("diagnostics") { view: LeaderHelpInputView -> view.diagnostics() }
      AsyncFunction("resetDiagnostics") { view: LeaderHelpInputView -> view.resetDiagnostics() }
      AsyncFunction("testInput") { view: LeaderHelpInputView, text: String, interval: Int -> view.testInput(text, interval) }
      AsyncFunction("testSelection") { view: LeaderHelpInputView, start: Int, end: Int -> view.testSelection(start, end) }
      AsyncFunction("testDelete") { view: LeaderHelpInputView, count: Int -> view.testDelete(count) }
      OnViewDestroys { view: LeaderHelpInputView -> view.dispose() }
    }
  }
}
