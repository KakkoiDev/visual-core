"""Run the unittest suite (same discovery as `python3 -m unittest discover -s tests`) and write a JUnit report.

  python3 tests/junit_run.py .test-output/unittest-junit.xml

tools/test-core/scenarios.py reads the report to require that every scenario's test ran and passed. Standard library.
"""
from pathlib import Path
import sys
import time
import unittest
import xml.etree.ElementTree as ET


class Recording(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cases = []

    def startTest(self, test):
        self._started = time.perf_counter()
        super().startTest(test)

    def _record(self, test, kind=None, detail=''):
        self.cases.append((test, kind, detail, time.perf_counter() - getattr(self, '_started', time.perf_counter())))

    def addSuccess(self, test):
        super().addSuccess(test)
        self._record(test)

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self._record(test, 'failure', self._exc_info_to_string(err, test))

    def addError(self, test, err):
        super().addError(test, err)
        self._record(test, 'error', self._exc_info_to_string(err, test))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self._record(test, 'skipped', reason)

    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        if err is not None:
            kind = 'failure' if issubclass(err[0], test.failureException) else 'error'
            self._record(test, kind, self._exc_info_to_string(err, test))


def main(report: str) -> int:
    root = Path(__file__).resolve().parent
    suite = unittest.defaultTestLoader.discover(str(root), top_level_dir=str(root))
    result = unittest.TextTestRunner(resultclass=Recording, verbosity=1).run(suite)
    tree = ET.Element('testsuite', name='unittest', tests=str(result.testsRun),
                      failures=str(len(result.failures)), errors=str(len(result.errors)))
    for test, kind, detail, seconds in result.cases:
        case = ET.SubElement(tree, 'testcase', classname=type(test).__module__ + '.' + type(test).__name__,
                             name=getattr(test, '_testMethodName', str(test)), time=f'{seconds:.3f}')
        if kind:
            ET.SubElement(case, kind, message=detail.strip().splitlines()[-1] if detail.strip() else kind).text = detail
    Path(report).parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(tree).write(report, encoding='utf-8', xml_declaration=True)
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else '.test-output/unittest-junit.xml'))
