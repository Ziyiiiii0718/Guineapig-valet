import unittest
import numpy as np
from PIL import Image
from color import rgb_lab, features, fit, distance


class ColorTests(unittest.TestCase):
    def test_lab_known_srgb(self):
        lab = rgb_lab(np.array([[0., 0., 0.], [1., 1., 1.], [1., 0., 0.]]))
        np.testing.assert_allclose(lab[0], [0, 0, 0], atol=.001)
        np.testing.assert_allclose(lab[1], [100, 0, 0], atol=.001)
        np.testing.assert_allclose(lab[2], [53.2408, 80.0925, 67.2032], atol=.001)

    def test_histograms_and_distance(self):
        red = features(Image.new('RGB', (2, 3), 'red'))
        blue = features(Image.new('RGB', (4, 2), 'blue'))
        for method in red:
            self.assertAlmostEqual(red[method].sum(), 1)
            self.assertEqual(distance(red[method], red[method]), 0)
            self.assertAlmostEqual(distance(red[method], blue[method]), 1)

    def test_reference_only(self):
        vectors = {p: {m: np.array(v) for m in ('HSV', 'Lab')} for p, v in
                   [('p', [1., 0.]), ('a', [0., 1.]), ('dev', [.5, .5])]}
        rows = [dict(path='p', label='potato', split='train'),
                dict(path='a', label='annie', split='train'),
                dict(path='dev', label='potato', split='development')]
        for method, pets in fit(rows, vectors).items():
            np.testing.assert_array_equal(pets['potato'], [1, 0])
            np.testing.assert_array_equal(pets['annie'], [0, 1])


if __name__ == '__main__':
    unittest.main()
